import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteHistoryPlan,
  readHistoryPlans,
  saveHistoryPlan,
} from '../api/historyPlans'
import type {
  HistoryPlan,
  SaveHistoryPlanInput,
} from '../api/historyPlans'

export type { HistoryPlan, SaveHistoryPlanInput } from '../api/historyPlans'

export type HistoryPlansController = {
  plans: HistoryPlan[]
  loadFailed: boolean
  refresh: () => Promise<void>
  save: (input: SaveHistoryPlanInput) => Promise<void>
  remove: (id: string) => Promise<void>
}

/**
 * Owns the history API lifecycle and rejects stale list responses. The
 * Workbench consumes commands from this boundary instead of coordinating
 * request ids and remote DTOs alongside packing state.
 */
export function useHistoryPlans(): HistoryPlansController {
  const [plans, setPlans] = useState<HistoryPlan[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    try {
      const nextPlans = await readHistoryPlans()
      if (requestId !== requestIdRef.current) return
      setPlans(nextPlans)
      setLoadFailed(false)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error(error)
      setLoadFailed(true)
    }
  }, [])

  const save = useCallback(async (input: SaveHistoryPlanInput) => {
    await saveHistoryPlan(input)
    await refresh()
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await deleteHistoryPlan(id)
    await refresh()
  }, [refresh])

  useEffect(() => {
    // Let StrictMode cancel its development-only trial mount before requests start.
    const requestTimer = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      requestIdRef.current += 1
    }
  }, [refresh])

  return {
    plans,
    loadFailed,
    refresh,
    save,
    remove,
  }
}
