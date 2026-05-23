import type { ContainerSpec, PackingResult } from '../types'
import { computeRemainingCapacity } from './remainingCapacity'
import { STANDARD_BOXES } from '../data/standardBoxes'
import type { StandardBoxPreset } from '../data/standardBoxes'

export type FillSuggestion = {
  preset: StandardBoxPreset
  /** Upper-bound count of this preset that still fits the residual volume and weight. */
  maxCount: number
  /** Theoretical residual-volume cap (without weight gating). */
  volumeCap: number
  /** Residual-weight cap (without volume gating). */
  weightCap: number
}

/**
 * Suggest how many of each standard box preset could still be packed alongside the
 * current automatic placement. The heuristic is the smaller of two independent caps:
 *   - remainingVolume / boxVolume
 *   - remainingWeight / boxWeight
 *
 * This is intentionally an upper bound — actual fit depends on geometry. The UI must
 * communicate that and let the user re-run the packer to confirm.
 */
export function suggestFillItems(
  result: PackingResult | null,
  container: ContainerSpec,
  presets: StandardBoxPreset[] = STANDARD_BOXES,
): FillSuggestion[] {
  const placed = result?.placed ?? []
  const capacity = computeRemainingCapacity(placed, container)
  return presets.map((preset) => {
    const boxVolume = preset.length * preset.width * preset.height
    const volumeCap = boxVolume > 0 ? Math.floor(capacity.remainingVolume / boxVolume) : 0
    const weightCap = preset.weight > 0 ? Math.floor(capacity.remainingWeight / preset.weight) : Number.POSITIVE_INFINITY
    return {
      preset,
      maxCount: Math.max(0, Math.min(volumeCap, weightCap)),
      volumeCap: Math.max(0, volumeCap),
      weightCap: Math.max(0, Number.isFinite(weightCap) ? weightCap : volumeCap),
    }
  })
}
