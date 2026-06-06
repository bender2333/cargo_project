import type { CargoItem } from '../types'
import { fetchWithAuth } from './auth'

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
  }
}

export async function readCustomCargo(): Promise<CargoItem[]> {
  const res = await fetchWithAuth('/api/custom-cargo')
  if (!res.ok) return []
  return res.json()
}

export async function saveCustomCargo(item: CargoItem): Promise<CargoItem | null> {
  const res = await fetchWithAuth('/api/custom-cargo', {
    method: 'POST',
    body: JSON.stringify(payloadFromCargo(item)),
  })
  if (!res.ok) return null
  return res.json()
}

export async function updateCustomCargo(id: string, item: CargoItem): Promise<CargoItem | null> {
  const res = await fetchWithAuth(`/api/custom-cargo/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payloadFromCargo(item)),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteCustomCargo(id: string): Promise<boolean> {
  const res = await fetchWithAuth(`/api/custom-cargo/${id}`, {
    method: 'DELETE',
  })
  return res.ok
}
