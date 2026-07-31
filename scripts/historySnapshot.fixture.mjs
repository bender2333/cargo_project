export function validHistorySnapshot(overrides = {}) {
  const container = {
    id: 'c1', label: 'Container', description: '', length: 1000, width: 1000, height: 1000,
    maxWeight: 1000, doorGap: 0, topGap: 0, sideGap: 0,
  }
  return {
    schemaVersion: 2,
    containerId: 'c1',
    container,
    cargoItems: [{
      id: 'a', name: 'Alpha', label: 'A', length: 500, width: 400, height: 300,
      weight: 10, quantity: 1, color: '#111', canRotate: true, stackable: true,
    }],
    placedCount: 1,
    totalCargoCount: 1,
    layerCount: 1,
    labelSummary: 'A:1/1',
    placementMode: 'auto',
    packingResult: {
      placed: [{
        id: 'box-1', cargoId: 'a', name: 'Alpha', label: 'A', index: 1,
        x: 0, y: 0, z: 0, length: 500, width: 400, height: 300,
        orientationKey: 'LWH', labelRotationDeg: 0, weight: 10, color: '#111',
        canRotate: true, stackable: true, physicalLayer: 1, depthLayer: 1,
        workStep: 1, supportType: 'floor', supportedBy: [],
      }],
      unplaced: [],
      layers: [{
        id: 'layer-1', physicalLayer: 1, minZ: 0, maxZ: 300, count: 1,
        weight: 10, volume: 60_000_000, labels: [{ label: 'A', color: '#111', count: 1 }], supportedBy: [],
      }],
      workSteps: [{ step: 1, boxId: 'box-1', cargoId: 'a', label: 'A', physicalLayer: 1, supportType: 'floor' }],
      labelStats: [{ label: 'A', name: 'Alpha', color: '#111', planned: 1, placed: 1, unplaced: 0, layers: [1] }],
      diagnostics: [],
      totalCargoCount: 1,
      placedCount: 1,
      usedVolume: 60_000_000,
      containerVolume: 1_000_000_000,
      volumeUtilization: 6,
      usedWeight: 10,
      weightUtilization: 1,
    },
    ...overrides,
  }
}

export function validLegacyHistorySnapshot() {
  const snapshot = validHistorySnapshot()
  return {
    containerId: snapshot.containerId,
    container: snapshot.container,
    cargoItems: snapshot.cargoItems,
    placedCount: snapshot.placedCount,
    totalCargoCount: snapshot.totalCargoCount,
    layerCount: snapshot.layerCount,
    labelSummary: snapshot.labelSummary,
  }
}

export function validManualHistorySnapshot() {
  const snapshot = validHistorySnapshot()
  const placed = snapshot.packingResult.placed[0]
  Object.assign(placed, {
    yawQuarterTurn: 0,
    pitchQuarterTurn: 0,
    orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    orientationLabel: 'L+ / W+ / H+',
  })
  return {
    ...snapshot,
    placementMode: 'manual',
    manualDraft: { boxes: [{
      id: placed.id,
      cargoId: placed.cargoId,
      label: placed.label,
      color: placed.color,
      baseLength: 500,
      baseWidth: 400,
      baseHeight: 300,
      x: placed.x,
      y: placed.y,
      z: placed.z,
      length: placed.length,
      width: placed.width,
      height: placed.height,
      orientationKey: placed.orientationKey,
      labelRotationDeg: placed.labelRotationDeg,
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
      orientationLabel: 'L+ / W+ / H+',
    }] },
  }
}
