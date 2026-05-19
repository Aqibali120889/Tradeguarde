"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAgentStore, type AgentId } from "@/stores/agent-store"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const HEARTBEAT_URL = `${API_BASE}/api/agents/heartbeat`
const POLL_INTERVAL_MS = 5000

export interface HeartbeatData {
  agent: string
  name: string
  status: "active" | "standby" | "error"
  last_execution: string
  events_processed: number
  workflow_count: number
  latency_ms: number
  tools_active: string[]
  memory_mb: number
  api_calls_per_min: number
  uptime_pct: number
  timestamp: string
}

export interface HeartbeatResponse {
  agents: HeartbeatData[]
  system_timestamp: string
  total_events: number
}

// Fallback synthetic heartbeat when backend is offline
// Derives plausible data from agent-store event counts
function buildFallbackHeartbeat(
  agentId: string,
  eventCount: number,
  lastActiveTs: number
): HeartbeatData {
  const now = Date.now()
  const secsAgo = Math.floor((now - lastActiveTs) / 1000)
  const isActive = secsAgo < 10

  const latencyMap: Record<string, number> = {
    watchdog: 180, impact: 240, planner: 310,
    execution: 155, governance: 290, communication: 120,
  }

  return {
    agent: agentId,
    name: agentId,
    status: isActive ? "active" : "standby",
    last_execution: new Date(lastActiveTs).toISOString(),
    events_processed: eventCount,
    workflow_count: Math.floor(eventCount * 0.4),
    latency_ms: (latencyMap[agentId] ?? 200) + Math.floor(Math.random() * 40),
    tools_active: [],
    memory_mb: 28 + eventCount * 0.3,
    api_calls_per_min: eventCount > 0 ? 1.2 + Math.random() : 0,
    uptime_pct: 99.1 + Math.random() * 0.8,
    timestamp: new Date().toISOString(),
  }
}

export function useHeartbeatMonitor() {
  const agents = useAgentStore(s => s.agents)
  const updateHeartbeat = useAgentStore(s => s.updateHeartbeat)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const failCountRef = useRef(0)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(HEARTBEAT_URL, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: HeartbeatResponse = await res.json()
      failCountRef.current = 0

      if (mountedRef.current && data.agents?.length) {
        data.agents.forEach((hb: HeartbeatData) => {
          updateHeartbeat(hb.agent as AgentId, hb)
        })
      }
    } catch {
      failCountRef.current++

      // After 2 failures, derive from local agent-store state
      if (failCountRef.current >= 2 && mountedRef.current) {
        agents.forEach(agent => {
          const fallback = buildFallbackHeartbeat(
            agent.id,
            agent.eventCount,
            agent.lastActiveTs
          )
          updateHeartbeat(agent.id, fallback)
        })
      }
    }
  }, [agents, updateHeartbeat])

  useEffect(() => {
    mountedRef.current = true
    poll() // immediate first poll
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [poll])

  const heartbeats = useAgentStore(s => s.heartbeatData)
  const isLive = failCountRef.current < 2

  return { heartbeats, isLive }
}
