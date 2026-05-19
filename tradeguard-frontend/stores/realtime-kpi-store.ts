import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

// ─── Types ─────────────────────────────────────────────────────────────────

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

export interface KPISource {
  field: keyof KPISnapshot
  derivedFrom: string      // e.g. "SSE events: 14 critical"
  lastUpdated: string
  agentResponsible: string
  eventCount: number
}

// ─── Store ─────────────────────────────────────────────────────────────────

interface RealtimeKPIStore {
  kpi: KPISnapshot
  sources: Partial<Record<keyof KPISnapshot, KPISource>>
  lastBackendSync: string | null
  isLive: boolean          // true = derived from real events; false = initial defaults

  // Called by live-store event bridge
  ingestEvent: (event: {
    severity: string
    agent: string
    timestamp: string
    affected_entities: string[]
    topic: string
    trace_id: string
  }) => void

  // Called by hydration from /api/stream/state
  hydrateFromBackend: (kpi: Partial<KPISnapshot>, timestamp: string) => void

  setLive: (v: boolean) => void
}

// Initial state — clearly labeled as pre-connection defaults
const DEFAULTS: KPISnapshot = {
  compliance_score: 98.4,
  compliance_trend: 0,
  active_risks: 0,
  risks_trend: 0,
  affected_shipments: 0,
  shipments_trend: 0,
  autonomous_actions: 0,
  actions_trend: 0,
}

let criticalCount = 0
let successCount = 0
let warningCount = 0
let totalEvents = 0
let affectedSet = new Set<string>()

export const useRealtimeKPIStore = create<RealtimeKPIStore>()(
  subscribeWithSelector((set, get) => ({
    kpi: { ...DEFAULTS },
    sources: {},
    lastBackendSync: null,
    isLive: false,

    ingestEvent: (event) => {
      totalEvents++
      const now = event.timestamp || new Date().toISOString()

      // Track affected entities
      // (affected_entities is from SSE payload)
      if (event.affected_entities?.length) {
        event.affected_entities.forEach(e => affectedSet.add(e))
      }

      if (event.severity === "critical") criticalCount++
      if (event.severity === "warning") warningCount++
      if (event.severity === "success") successCount++

      set(state => {
        const kpi = { ...state.kpi }
        const sources = { ...state.sources }

        // active_risks — driven by unresolved critical/warning events
        const newRisks = criticalCount + Math.floor(warningCount * 0.3)
        const prevRisks = kpi.active_risks
        kpi.active_risks = newRisks
        kpi.risks_trend = newRisks - prevRisks
        sources.active_risks = {
          field: "active_risks",
          derivedFrom: `${criticalCount} critical + ${warningCount} warning events`,
          lastUpdated: now,
          agentResponsible: event.agent || "watchdog",
          eventCount: totalEvents,
        }

        // autonomous_actions — success events from execution agent
        if (event.severity === "success") {
          kpi.autonomous_actions += 1
          kpi.actions_trend = 1
          sources.autonomous_actions = {
            field: "autonomous_actions",
            derivedFrom: `${successCount} successful executions via SSE`,
            lastUpdated: now,
            agentResponsible: "execution",
            eventCount: successCount,
          }
        }

        // affected_shipments — unique affected entities
        const prevShipments = kpi.affected_shipments
        const newShipments = affectedSet.size
        kpi.affected_shipments = newShipments
        kpi.shipments_trend = newShipments - prevShipments
        sources.affected_shipments = {
          field: "affected_shipments",
          derivedFrom: `${affectedSet.size} unique affected entities in event stream`,
          lastUpdated: now,
          agentResponsible: event.agent || "impact",
          eventCount: totalEvents,
        }

        // compliance_score — ratio of success to total, smoothed
        if (totalEvents > 0) {
          const successRatio = successCount / totalEvents
          const baseScore = 96 + successRatio * 4
          const riskPenalty = criticalCount * 0.2
          const newScore = Math.max(85, Math.min(100, baseScore - riskPenalty))
          kpi.compliance_trend = parseFloat((newScore - kpi.compliance_score).toFixed(2))
          kpi.compliance_score = parseFloat(newScore.toFixed(1))
          sources.compliance_score = {
            field: "compliance_score",
            derivedFrom: `${successCount}/${totalEvents} events resolved successfully`,
            lastUpdated: now,
            agentResponsible: "governance",
            eventCount: totalEvents,
          }
        }

        return { kpi, sources, isLive: true }
      })
    },

    hydrateFromBackend: (backendKpi, timestamp) => {
      set(state => ({
        kpi: { ...state.kpi, ...backendKpi },
        lastBackendSync: timestamp,
        isLive: true,
      }))
    },

    setLive: (v) => set({ isLive: v }),
  }))
)
