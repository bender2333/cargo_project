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
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  },
  {
    id: '40gp',
    label: "Container 40'",
    description: '40 ft general purpose container from EasyCargo cargo spaces',
    length: 12032,
    width: 2352,
    height: 2385,
    maxWeight: 26600,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  },
  {
    id: '40hq',
    label: "Container 40' HC",
    description: '40 ft high cube container from EasyCargo cargo spaces',
    length: 12117,
    width: 2388,
    height: 2694,
    maxWeight: 29600,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  },
  {
    id: '45hq',
    label: "Container 45' HC",
    description: '45 ft high cube container',
    length: 13556,
    width: 2352,
    height: 2698,
    maxWeight: 27700,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  },
]

export function effectiveContainer(container: ContainerSpec): ContainerSpec {
  return {
    ...container,
    id: `${container.id}-effective`,
    label: `${container.label} effective`,
    length: Math.max(0, container.length - container.doorGap),
    width: Math.max(0, container.width - container.sideGap * 2),
    height: Math.max(0, container.height - container.topGap),
  }
}

export function getContainerVolume(container: ContainerSpec) {
  const effective = effectiveContainer(container)
  return effective.length * effective.width * effective.height
}

export function formatCubicMeters(volumeMm3: number) {
  return `${(volumeMm3 / 1_000_000_000).toFixed(2)} m³`
}
