import type { CargoItem } from '../types'

/**
 * Industry-common box presets that operators may want to top up a half-filled container with.
 * Each entry maps to a standalone CargoItem ready to be appended to the cargo list.
 *
 * Dimensions are in millimetres, weight in kilograms.
 */
export type StandardBoxPreset = {
  id: string
  label: string
  name: string
  length: number
  width: number
  height: number
  weight: number
  color: string
}

export const STANDARD_BOXES: StandardBoxPreset[] = [
  { id: 'std-s', label: 'S', name: 'Small carton 400×300×200', length: 400, width: 300, height: 200, weight: 4, color: '#a78bfa' },
  { id: 'std-m', label: 'M', name: 'Medium carton 600×400×400', length: 600, width: 400, height: 400, weight: 10, color: '#60a5fa' },
  { id: 'std-l', label: 'L', name: 'Large carton 800×600×500', length: 800, width: 600, height: 500, weight: 25, color: '#34d399' },
  { id: 'std-pallet', label: 'P', name: 'EU pallet load 1200×800×1200', length: 1200, width: 800, height: 1200, weight: 300, color: '#f59e0b' },
]

export function buildStandardCargoItem(preset: StandardBoxPreset, quantity: number, idFactory: () => string): CargoItem {
  return {
    id: idFactory(),
    label: preset.label,
    name: preset.name,
    length: preset.length,
    width: preset.width,
    height: preset.height,
    weight: preset.weight,
    quantity,
    color: preset.color,
    canRotate: true,
    stackable: true,
  }
}
