"use client"

import { useEffect, useRef, useCallback } from "react"
import { toast } from "sonner"
import { useLiveStore, type LiveEvent } from "@/stores/live-store"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const SSE_URL  = `${API_BASE}/api/stream/events`
const HYDRATE_URL = `${API_BASE}/api/stream/state`

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

/**
 * Opens a Server-Sent Events connection to the FastAPI stream endpoint.
 * - Parses each event and routes it into the Zustand live store
 * - Reconnects with exponential backoff on disconnect
 * - Fires toast notifications for critical events
 * - Hydrates from /api/stream/state on first mount
 */
export function useLiveStream() {
  const esRef        = useRef<EventSource | null>(null)
  const backoffRef   = useRef(MIN_BACKOFF_MS)
  const mountedRef   = useRef(true)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { setConnected, setReconnecting, addEvent, hydrateFromSnapshot } = useLiveStore()

  // ── Initial state hydration ─────────────────────────────────────────
  const hydrate = useCallback(async () => {
    try {
      const res = await fetch(HYDRATE_URL)
      if (res.ok) {
        const snapshot = await res.json()
        hydrateFromSnapshot(snapshot)
      }
    } catch {
      // Silent — backend may not be running yet
    }
  }, [hydrateFromSnapshot])

  // ── SSE connection ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (typeof EventSource === "undefined") return  // SSR guard

    // Close existing connection
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const es = new EventSource(SSE_URL)
    esRef.current = es

    es.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      backoffRef.current = MIN_BACKOFF_MS  // Reset backoff
    }

    es.onmessage = (e) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(e.data)

        // Connection confirmation ping — not a real event
        if (data.type === "connected") return

        const event: LiveEvent = {
          id:               data.trace_id ?? crypto.randomUUID(),
          topic:            data.topic ?? "",
          title:            data.title ?? "Agent Event",
          summary:          data.summary ?? "",
          severity:         data.severity ?? "info",
          agent:            data.agent ?? "system",
          timestamp:        data.timestamp ?? new Date().toISOString(),
          payload:          data.payload ?? {},
          affected_entities: data.affected_entities ?? [],
          confidence_score: data.confidence_score ?? 1.0,
        }

        addEvent(event)

        // Toast on critical events only (avoid notification overload)
        if (event.severity === "critical") {
          toast.error(event.title, {
            description: event.summary.slice(0, 120),
            duration: 6000,
          })
        }
      } catch {
        // Malformed event — ignore
      }
    }

    es.onerror = () => {
      if (!mountedRef.current) return
      es.close()
      esRef.current = null
      setConnected(false)
      setReconnecting(true)

      // Exponential backoff
      const delay = backoffRef.current
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS)

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }
  }, [addEvent, setConnected, setReconnecting])

  // ── Lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    hydrate()
    connect()

    return () => {
      mountedRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      setConnected(false)
    }
  }, [connect, hydrate, setConnected])

  return {
    connected:    useLiveStore((s) => s.connected),
    reconnecting: useLiveStore((s) => s.reconnecting),
    lastSeen:     useLiveStore((s) => s.lastSeen),
  }
}
