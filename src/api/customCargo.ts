import type { CargoItem } from '../types'
import { fetchWithAuth } from './client'

type CustomCargoDto = {
  id: string
  name: string
  label: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  color: string
  canRotate: boolean
  stackable: boolean
  maxStackLayers?: number
  groundOnly?: boolean
  createdAt: string
}

type CustomCargoPayload = Omit<CargoItem, 'id' | 'quantity'>

function payloadFromCargo(item: CargoItem): CustomCargoPayload {
  return {
    name: item.name,
    label: item.label,
    length: item.length,
    width: item.width,
    height: item.height,
    weight: item.weight,
    color: item.color,
    canRotate: item.canRotate,
    stackable: item.stackable,
    maxStackLayers: item.maxStackLayers,
    groundOnly: item.groundOnly,
  }
}

function cargoFromDto(item: CustomCargoDto): CargoItem {
  return {
    id: item.id,
    name: item.name,
    label: item.label,
    length: item.length,
    width: item.width,
    height: item.height,
    weight: item.weight,
    quantity: item.quantity,
    color: item.color,
    canRotate: item.canRotate,
    stackable: item.stackable,
    maxStackLayers: item.maxStackLayers,
    groundOnly: item.groundOnly,
  }
}

async function writeCustomCargo(
  path: string,
  method: 'POST' | 'PUT',
  item: CargoItem,
): Promise<CargoItem> {
  const response = await fetchWithAuth(path, {
    method,
    body: JSON.stringify(payloadFromCargo(item)),
  })
  if (!response.ok) throw new Error('保存货物失败')
  return cargoFromDto(await response.json() as CustomCargoDto)
}

export async function readCustomCargo(): Promise<CargoItem[]> {
  const response = await fetchWithAuth('/api/custom-cargo')
  if (!response.ok) throw new Error('货物库加载失败')
  const data = await response.json() as CustomCargoDto[]
  return data.map(cargoFromDto)
}

export function saveCustomCargo(item: CargoItem): Promise<CargoItem> {
  return writeCustomCargo('/api/custom-cargo', 'POST', item)
}

export function updateCustomCargo(id: string, item: CargoItem): Promise<CargoItem> {
  return writeCustomCargo(`/api/custom-cargo/${id}`, 'PUT', item)
}

export async function deleteCustomCargo(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/custom-cargo/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('删除货物失败')
}
