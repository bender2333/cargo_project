import type { ContainerSpec } from '../types'

export const containers: ContainerSpec[] = [
  {
    id: '20gp',
    label: "Container 20'",
    description: '20 ft general purpose container from EasyCargo cargo spaces',
    length: 5758,
    width: 2352,
    height: 2385,
    maxWeight: 28200,
  },
  {
    id: '40gp',
    label: "Container 40'",
    description: '40 ft general purpose container from EasyCargo cargo spaces',
    length: 12032,
    width: 2352,
    height: 2385,
    maxWeight: 26600,
  },
  {
    id: '40hq',
    label: "Container 40' HC",
    description: '40 ft high cube container from EasyCargo cargo spaces',
    length: 12117,
    width: 2388,
    height: 2694,
    maxWeight: 29600,
  },
]

export function getContainerVolume(container: ContainerSpec) {
  return container.length * container.width * container.height
}

export function formatCubicMeters(volumeMm3: number) {
  return `${(volumeMm3 / 1_000_000_000).toFixed(2)} m³`
}
