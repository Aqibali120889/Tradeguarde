import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

// ─── Domain Types ──────────────────────────────────────────────────────────

export type Severity = "info" | "warning" | "critical" | "success"

export interface LiveEvent {
  id: string
  topic: string
  title: string
  summary: string
  severity: Severity
  agent: string
  timestamp: string
  payload: Record<string, unknown>
  affected_entities: string[]
  confidence_score: number
}

export interface KPISnapshot {
  compliance_score: number
  compliance_trend: number
  active_risks: number
  risks_trend: number
  affected_shipments: number
  shipments_trend: number
  autonomous_actions: number
  actions_trend: number
}

export interface Disruption {
  id: string
  label: string
  severity: Severity
  region: string
  timestamp: string
}

// ─── Store Shape ────────────────────────────────────────────────────────────

interface LiveStore {
  // Connection
  connected: boolean
  reconnecting: boolean
  lastSeen: string | null

  // Events (rolling 50)
  events: LiveEvent[]

  // Derived
  alerts: LiveEvent[]         // severity=critical|warning
  agentActivity: LiveEvent[]  // all events for activity feed
  disruptions: Disruption[]
  kpi: KPISnapshot

  // Actions
  setConnected: (v: boolean) => void
  setReconnecting: (v: boolean) => void
  addEvent: (event: LiveEvent) => void
  hydrateFromSnapshot: (snapshot: {
    kpi?: Partial<KPISnapshot>
    events?: LiveEvent[]
    alerts?: LiveEvent[]
    disruptions?: Disruption[]
  }) => void
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useLiveStore = create<LiveStore>()(
  subscribeWithSelector((set, get) => ({
    connected: false,
    reconnecting: false,
    lastSeen: null,

    events: [],
    alerts: [],
    agentActivity: [],
    disruptions: [],
    // Start with zeros — populated from real events or backend hydration
    kpi: {
      compliance_score: 98.4,
      compliance_trend: 0,
      active_risks: 0,
      risks_trend: 0,
      affected_shipments: 0,
      shipments_trend: 0,
      autonomous_actions: 0,
      actions_trend: 0,
    },

    setConnected: (v) => set({ connected: v, reconnecting: false }),
    setReconnecting: (v) => set({ reconnecting: v }),

    addEvent: (event) =>
      set((state) => {
        const events = [event, ...state.events].slice(0, 50)
        const alerts = events.filter(
          (e) => e.severity === "critical" || e.severity === "warning"
        )
        const agentActivity = events

        // Incrementally update KPI on meaningful events
        let kpi = { ...state.kpi }
        if (event.severity === "critical") {
          kpi.active_risks = Math.min(kpi.active_risks + 1, 999)
          kpi.risks_trend = 1
        }
        if (event.severity === "success") {
          kpi.autonomous_actions += 1
          kpi.actions_trend = 1
        }
        if (event.affected_entities?.length) {
          kpi.affected_shipments = Math.min(
            kpi.affected_shipments + event.affected_entities.length, 9999
          )
        }

        // ── Bridge to realtime-kpi-store ────────────────────────────────
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useRealtimeKPIStore } = require("@/stores/realtime-kpi-store")
          useRealtimeKPIStore.getState().ingestEvent({
            severity: event.severity,
            agent: event.agent,
            timestamp: event.timestamp,
            affected_entities: event.affected_entities,
            topic: event.topic,
            trace_id: event.id,
          })
        } catch { /* ignore if store not yet ready */ }

        // ── Bridge to orchestration-store (workflow tracking) ───────────
        try {
          const workflowId = (event.payload as Record<string, string>)?.workflow_id
          if (workflowId) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useOrchestrationStore } = require("@/stores/orchestration-store")
            const agentIconMap: Record<string, string> = {
              watchdog: "👁", impact: "📊", planner: "🧠",
              execution: "⚡", governance: "⚖️", communication: "📡",
            }
            const agentNameMap: Record<string, string> = {
              watchdog: "Regulatory Watchdog", impact: "Impact Analyzer",
              planner: "Action Planner", execution: "Execution Agent",
              governance: "Governance Agent", communication: "Communication Agent",
            }
            const agentKey = event.agent?.toLowerCase() || "watchdog"
            useOrchestrationStore.getState().addWorkflowFromEvent({
              workflowId,
              title: event.title,
              severity: event.severity,
              agentId: agentKey,
              agentName: agentNameMap[agentKey] || event.agent,
              agentIcon: agentIconMap[agentKey] || "🤖",
              label: event.summary || event.title,
              eventId: event.id,
              timestamp: event.timestamp,
              topic: event.topic,
            })
          }
        } catch { /* ignore if store not yet ready */ }

        return {
          events,
          alerts,
          agentActivity,
          kpi,
          lastSeen: event.timestamp,
        }
      }),

    hydrateFromSnapshot: (snapshot) =>
      set((state) => {
        if (snapshot.kpi) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useRealtimeKPIStore } = require("@/stores/realtime-kpi-store")
            useRealtimeKPIStore.getState().hydrateFromBackend(
              snapshot.kpi,
              new Date().toISOString()
            )
          } catch { /* ignore */ }
        }
        return {
          kpi: snapshot.kpi ? { ...state.kpi, ...snapshot.kpi } : state.kpi,
          events: snapshot.events ?? state.events,
          alerts: snapshot.alerts ?? state.alerts,
          disruptions: snapshot.disruptions ?? state.disruptions,
        }
      }),
  }))
)
