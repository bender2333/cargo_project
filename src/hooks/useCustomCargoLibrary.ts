import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteCustomCargo,
  readCustomCargo,
  saveCustomCargo,
  updateCustomCargo,
} from '../api/customCargo'
import type { CargoItem } from '../types'

export type CustomCargoLibraryController = {
  items: CargoItem[]
  loadFailed: boolean
  refresh: () => Promise<void>
  create: (item: CargoItem) => Promise<void>
  update: (id: string, item: CargoItem) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useCustomCargoLibrary(): CustomCargoLibraryController {
  const [items, setItems] = useState<CargoItem[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(false)
  const lifecycleEpochRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return
    const requestId = ++requestIdRef.current
    try {
      const nextItems = await readCustomCargo()
      if (requestId !== requestIdRef.current) return
      setItems(nextItems)
      setLoadFailed(false)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error(error)
      setLoadFailed(true)
    }
  }, [])

  const mutateAndRefresh = useCallback(async (mutation: () => Promise<unknown>) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    await mutation()
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return
    await refresh()
  }, [refresh])

  const create = useCallback(async (item: CargoItem) => {
    await mutateAndRefresh(() => saveCustomCargo(item))
  }, [mutateAndRefresh])

  const update = useCallback(async (id: string, item: CargoItem) => {
    await mutateAndRefresh(() => updateCustomCargo(id, item))
  }, [mutateAndRefresh])

  const remove = useCallback(async (id: string) => {
    await mutateAndRefresh(() => deleteCustomCargo(id))
  }, [mutateAndRefresh])

  useEffect(() => {
    mountedRef.current = true
    lifecycleEpochRef.current += 1
    const requestTimer = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      mountedRef.current = false
      lifecycleEpochRef.current += 1
      requestIdRef.current += 1
    }
  }, [refresh])

  return {
    items,
    loadFailed,
    refresh,
    create,
    update,
    remove,
  }
}
