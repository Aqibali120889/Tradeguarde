"use client"

import { useEffect, useRef } from "react"
import { useLiveStore } from "@/stores/live-store"
import { useTradeIntelligenceStore } from "@/stores/trade-intelligence-store"

/**
 * useGlobeEvents
 * ─────────────────────────────────────────────────────────────────────────
 * Bridges the live SSE event store → trade intelligence store.
 * Every new backend event is processed by the globe event processor
 * and triggers visual reactions on the CesiumJS globe.
 *
 * Separating concerns:
 *   useLiveStore  = raw event bus
 *   useTradeIntelligenceStore = derived globe state (routes, sanctions, shockwaves)
 */
export function useGlobeEvents() {
  const events = useLiveStore((s) => s.events)
  const processEvent = useTradeIntelligenceStore((s) => s.processEvent)
  const cleanupShockwaves = useTradeIntelligenceStore((s) => s.cleanupShockwaves)

  const processedIds = useRef<Set<string>>(new Set())

  // Process newly arrived events
  useEffect(() => {
    if (!events.length) return
    const newest = events[0]
    if (!newest || processedIds.current.has(newest.id)) return

    processedIds.current.add(newest.id)
    // Keep ref bounded
    if (processedIds.current.size > 200) {
      const arr = [...processedIds.current]
      processedIds.current = new Set(arr.slice(-100))
    }

    processEvent(newest)
  }, [events, processEvent])

  // Periodic shockwave cleanup
  useEffect(() => {
    const id = setInterval(cleanupShockwaves, 1000)
    return () => clearInterval(id)
  }, [cleanupShockwaves])
}
