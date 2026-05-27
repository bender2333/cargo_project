import { describe, expect, it } from 'vitest'
import { createManualOperationNotice, manualOperationNoticeMessage } from './manualFeedback'
import type { ValidationIssue } from './manualPlacement'

describe('manualFeedback', () => {
  it('maps validation issues to a localized non-blocking notice', () => {
    const issue: ValidationIssue = {
      type: 'floating',
      boxId: 'box-1',
      message: 'Box A is floating and needs support.',
    }
    const notice = createManualOperationNotice({
      operation: 'move',
      boxId: 'box-1',
      issues: [issue],
      locale: 'zh',
    })

    expect(notice).toMatchObject({
      operation: 'move',
      boxId: 'box-1',
      reasonCode: 'floating',
    })
    expect(manualOperationNoticeMessage(notice)).toContain('支撑')
  })
})
