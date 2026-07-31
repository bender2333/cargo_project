import { describe, expect, it } from 'vitest'
import {
  HISTORY_SNAPSHOT_MAX_BYTES,
  assertValidHistoryPlanData,
  historyPlanDataValidationError,
} from '../server/historySnapshot.mjs'
import { validHistorySnapshot, validLegacyHistorySnapshot, validManualHistorySnapshot } from './historySnapshot.fixture.mjs'


describe('server history snapshot validator', () => {
  it('accepts a valid v2 snapshot and the exact byte domain constant', () => {
    expect(() => assertValidHistoryPlanData(validHistorySnapshot())).not.toThrow()
    expect(HISTORY_SNAPSHOT_MAX_BYTES).toBe(2_500_000)
  })

  it('rejects malformed arrays, non-finite values, enums, and references', () => {
    const invalidArrays = validHistorySnapshot()
    invalidArrays.packingResult.workSteps = null
    expect(historyPlanDataValidationError(invalidArrays)).toMatch(/workSteps/)

    const invalidNumber = validHistorySnapshot()
    invalidNumber.container.maxWeight = Infinity
    expect(historyPlanDataValidationError(invalidNumber)).toMatch(/finite number/)

    const invalidEnum = validHistorySnapshot()
    invalidEnum.packingResult.placed[0].orientationKey = 'SIDEWAYS'
    expect(historyPlanDataValidationError(invalidEnum)).toMatch(/orientationKey/)

    const dangling = validHistorySnapshot()
    dangling.packingResult.workSteps[0].boxId = 'missing'
    expect(historyPlanDataValidationError(dangling)).toMatch(/boxId/)
  })

  it('rejects non-consecutive work steps and manual mode without a draft', () => {
    const nonConsecutive = validHistorySnapshot()
    nonConsecutive.packingResult.workSteps[0].step = 2
    expect(historyPlanDataValidationError(nonConsecutive)).toMatch(/consecutive/)

    expect(historyPlanDataValidationError(validHistorySnapshot({ placementMode: 'manual' }))).toMatch(/manualDraft/)
  })

  it('validates diagnostic provenance and rejects manual provenance in auto mode', () => {
    const diagnostic = validManualHistorySnapshot()
    diagnostic.packingResult.diagnostics = [{
      id: 'manual:overlap:box-1', severity: 'error', message: 'Overlap', source: 'manual', sourceIssueId: 'overlap:box-1',
    }]
    expect(historyPlanDataValidationError(diagnostic)).toBeNull()

    const autoWithManualSource = validHistorySnapshot()
    autoWithManualSource.packingResult.diagnostics = structuredClone(diagnostic.packingResult.diagnostics)
    expect(historyPlanDataValidationError(autoWithManualSource)).toEqual(expect.stringMatching(/manual.*auto|auto.*manual/))

    diagnostic.packingResult.diagnostics[0].source = 'automatic'
    expect(historyPlanDataValidationError(diagnostic)).toMatch(/source/)
    diagnostic.packingResult.diagnostics[0].source = 'manual'
    diagnostic.packingResult.diagnostics[0].sourceIssueId = 42
    expect(historyPlanDataValidationError(diagnostic)).toMatch(/sourceIssueId/)

    const missingSource = validHistorySnapshot()
    missingSource.packingResult.diagnostics = [{ id: 'manual:overlap:box-1', severity: 'error', message: 'Overlap', source: 'manual', sourceIssueId: 'overlap:box-1' }]
    delete missingSource.packingResult.diagnostics[0].source
    expect(historyPlanDataValidationError(missingSource)).toMatch(/provided together/)

    const missingSourceIssueId = validHistorySnapshot()
    missingSourceIssueId.packingResult.diagnostics = [{ id: 'manual:overlap:box-1', severity: 'error', message: 'Overlap', source: 'manual', sourceIssueId: 'overlap:box-1' }]
    delete missingSourceIssueId.packingResult.diagnostics[0].sourceIssueId
    expect(historyPlanDataValidationError(missingSourceIssueId)).toMatch(/provided together/)

    const duplicate = validManualHistorySnapshot()
    duplicate.packingResult.diagnostics = [{ id: 'manual:overlap:box-1', severity: 'error', message: 'Overlap', source: 'manual', sourceIssueId: 'overlap:box-1' }]
    duplicate.packingResult.diagnostics.push({ ...duplicate.packingResult.diagnostics[0] })
    expect(historyPlanDataValidationError(duplicate)).toMatch(/diagnostics\[1\]\.id must be unique/)

    const mutations = [
      ['baseHeight', (value) => { value.manualDraft.boxes[0].baseHeight = Infinity }],
      ['pitchQuarterTurn', (value) => { value.manualDraft.boxes[0].pitchQuarterTurn = 5 }],
      ['orientationAxes', (value) => { value.manualDraft.boxes[0].orientationAxes.z = 'Q+' }],
      ['orientationLabel', (value) => { value.manualDraft.boxes[0].orientationLabel = 9 }],
    ]
    for (const [field, mutate] of mutations) {
      const invalid = validManualHistorySnapshot()
      mutate(invalid)
      expect(historyPlanDataValidationError(invalid), field).toMatch(field)
    }
  })

  it('rejects manual draft and placed result mismatches with frontend parity', () => {
    const mutations = [
      (value) => { value.manualDraft.boxes[0].id = 'different-box' },
      (value) => { value.manualDraft.boxes = [] },
      (value) => { value.manualDraft.boxes[0].cargoId = 'different-cargo' },
      (value) => { value.manualDraft.boxes[0].z += 1 },
      (value) => { value.manualDraft.boxes[0].width += 1 },
      (value) => { value.manualDraft.boxes[0].orientationKey = 'WLH' },
      (value) => { value.manualDraft.boxes[0].labelRotationDeg = 90 },
      (value) => { value.manualDraft.boxes[0].yawQuarterTurn = 1 },
    ]
    for (const mutate of mutations) {
      const invalid = validManualHistorySnapshot()
      mutate(invalid)
      expect(historyPlanDataValidationError(invalid)).toMatch(/manualDraft/)
    }
  })

  it('requires manual draft labels and colors to match the saved result', () => {
    const labelMismatch = validManualHistorySnapshot()
    labelMismatch.manualDraft.boxes[0].label = 'B'
    expect(historyPlanDataValidationError(labelMismatch)).toEqual(expect.stringMatching(/label/))

    const colorMismatch = validManualHistorySnapshot()
    colorMismatch.manualDraft.boxes[0].color = '#222'
    expect(historyPlanDataValidationError(colorMismatch)).toEqual(expect.stringMatching(/color/))
  })

  it('rejects placed boxes outside the effective container bounds', () => {
    const outsideLength = validHistorySnapshot()
    outsideLength.packingResult.placed[0].x = 501
    expect(historyPlanDataValidationError(outsideLength)).toEqual(expect.stringMatching(/effective container/))

    const outsideHeight = validHistorySnapshot()
    outsideHeight.packingResult.placed[0].z = 701
    expect(historyPlanDataValidationError(outsideHeight)).toEqual(expect.stringMatching(/effective container/))
  })

  it('requires layer coverage and work-step metadata to match placed boxes', () => {
    const missingLayers = validHistorySnapshot()
    missingLayers.packingResult.layers = []
    missingLayers.layerCount = 0
    expect(historyPlanDataValidationError(missingLayers)).toEqual(expect.stringMatching(/layer/))

    const badStepLayer = validHistorySnapshot()
    badStepLayer.packingResult.workSteps[0].physicalLayer = 2
    expect(historyPlanDataValidationError(badStepLayer)).toEqual(expect.stringMatching(/physicalLayer/))

    const badStepSupport = validHistorySnapshot()
    badStepSupport.packingResult.workSteps[0].supportType = 'fully-supported'
    expect(historyPlanDataValidationError(badStepSupport)).toEqual(expect.stringMatching(/supportType/))
  })

  it('requires work-step cargo identity to match the placed box', () => {
    const invalid = validHistorySnapshot()
    invalid.packingResult.workSteps[0].cargoId = 'other-cargo'
    expect(historyPlanDataValidationError(invalid)).toEqual(expect.stringMatching(/cargoId/))
  })

  it('requires v2 totals to match planned cargo quantities', () => {
    const mismatch = validHistorySnapshot()
    mismatch.packingResult.totalCargoCount = 0
    mismatch.totalCargoCount = 0
    expect(historyPlanDataValidationError(mismatch)).toEqual(expect.stringMatching(/planned cargo|cargo quantities/))
  })

  it('rejects schema-less v2-only fields and inconsistent legacy totals', () => {
    expect(historyPlanDataValidationError(validLegacyHistorySnapshot())).toBeNull()
    const legacyWithResult = {
      containerId: 'c1',
      container: validHistorySnapshot().container,
      cargoItems: validHistorySnapshot().cargoItems,
      placedCount: 1,
      totalCargoCount: 1,
      layerCount: 1,
      labelSummary: 'A:1/1',
      packingResult: validHistorySnapshot().packingResult,
    }
    expect(historyPlanDataValidationError(legacyWithResult)).toMatch(/legacy.*packingResult/i)
    const inconsistent = { ...legacyWithResult, totalCargoCount: 2 }
    delete inconsistent.packingResult
    expect(historyPlanDataValidationError(inconsistent)).toMatch(/totalCargoCount/)
  })
})
