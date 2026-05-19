"use client"

import { useEffect, useRef } from "react"
import { useLiveStore } from "@/stores/live-store"
import { useObservabilityStore } from "@/stores/observability-store"

/**
 * useObservability
 * ─────────────────────────────────────────────────────────────────────
 * Subscribes to the live SSE event bus and feeds the observability store.
 * Mount this once in the layout so observability data is always current.
 */
export function useObservability() {
  const events = useLiveStore((s) => s.events)
  const connected = useLiveStore((s) => s.connected)
  const ingestEvent = useObservabilityStore((s) => s.ingestEvent)
  const setSSEConnected = useObservabilityStore((s) => s.setSSEConnected)

  const processedIds = useRef<Set<string>>(new Set())

  // Sync SSE connection status
  useEffect(() => {
    setSSEConnected(connected)
  }, [connected, setSSEConnected])

  // Process new events into observability
  useEffect(() => {
    if (!events.length) return
    const newest = events[0]
    if (!newest || processedIds.current.has(newest.id)) return

    processedIds.current.add(newest.id)
    if (processedIds.current.size > 500) {
      const arr = [...processedIds.current]
      processedIds.current = new Set(arr.slice(-250))
    }

    ingestEvent(newest)
  }, [events, ingestEvent])
}
