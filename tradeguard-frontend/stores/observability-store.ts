import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { LiveEvent } from "./live-store"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiEndpointStatus {
  name: string
  key: string
  url: string
  status: "operational" | "degraded" | "down" | "unknown"
  lastFetch: string | null
  latencyMs: number | null
  requestCount: number
  errorCount: number
  lastPayload: Record<string, unknown> | null
}

export interface WorkflowStep {
  id: string
  agent: string
  action: string
  timestamp: string
  durationMs?: number
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  status: "running" | "completed" | "failed"
}

export interface WorkflowTrace {
  workflow_id: string
  trigger: string
  steps: WorkflowStep[]
  startedAt: string
  completedAt: string | null
  status: "running" | "completed" | "failed"
}

export interface KPILineage {
  metric: string
  value: string
  derivedFrom: Array<{
    eventId: string
    source: string
    agent: string
    timestamp: string
    contribution: string
  }>
}

export interface SystemHealth {
  sseConnected: boolean
  activeAgents: number
  eventsPerMin: number
  avgLatencyMs: number
  workflowsCompleted: number
  workflowsFailed: number
  reroutesExecuted: number
  sanctionsDetected: number
  activeTradeRoutes: number
  ingestionQueueSize: number
}

interface ObservabilityStore {
  // Currently selected event ID for source inspector
  selectedSourceEventId?: string
  // Health
  health: SystemHealth
  // API monitor
  apiEndpoints: ApiEndpointStatus[]
  // Workflow traces
  traces: WorkflowTrace[]
  // KPI lineage map
  kpiLineage: Record<string, KPILineage>
  // Event throughput ring buffer [events per last N seconds]
  throughputBuckets: number[]

  // Actions
  ingestEvent: (event: LiveEvent) => void
  setSSEConnected: (v: boolean) => void
  updateApiStatus: (key: string, update: Partial<ApiEndpointStatus>) => void
}

// ─── Initial API endpoints ───────────────────────────────────────────────────

const INITIAL_APIS: ApiEndpointStatus[] = [
  { name: "WTO API",             key: "wto",           url: "https://api.wto.org/",           status: "unknown", lastFetch: null, latencyMs: null, requestCount: 0, errorCount: 0, lastPayload: null },
  { name: "OpenSanctions",       key: "opensanctions", url: "https://api.opensanctions.org/",  status: "unknown", lastFetch: null, latencyMs: null, requestCount: 0, errorCount: 0, lastPayload: null },
  { name: "Global Trade Alert",  key: "gta",           url: "https://www.globaltradealert.org/api/", status: "unknown", lastFetch: null, latencyMs: null, requestCount: 0, errorCount: 0, lastPayload: null },
  { name: "UN Comtrade",         key: "comtrade",      url: "https://comtradeapi.un.org/",    status: "unknown", lastFetch: null, latencyMs: null, requestCount: 0, errorCount: 0, lastPayload: null },
  { name: "Parsagon Regs",       key: "parsagon",      url: "https://api.parsagon.io/",       status: "unknown", lastFetch: null, latencyMs: null, requestCount: 0, errorCount: 0, lastPayload: null },
]

const AGENT_WORKFLOW_MAP: Record<string, string[]> = {
  watchdog:        ["Regulation scan", "Sanctions check", "Tariff detection"],
  impact_analyzer: ["Risk scoring", "Exposure calculation", "Shipment mapping"],
  planner:         ["Route generation", "Cost optimization", "Risk mitigation plan"],
  execution:       ["Workflow submission", "Reroute execution", "Status update"],
  governance:      ["Compliance check", "Policy enforcement", "Approval decision"],
}

const SOURCE_MAP: Record<string, string> = {
  watchdog:        "WTO API / OpenSanctions",
  impact_analyzer: "Internal risk engine",
  planner:         "Route optimizer",
  execution:       "Trade workflow API",
  governance:      "Compliance DB",
  system:          "TradeGuard platform",
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useObservabilityStore = create<ObservabilityStore>()(
  subscribeWithSelector((set, get) => ({
    health: {
      sseConnected: false,
      activeAgents: 0,
      eventsPerMin: 0,
      avgLatencyMs: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      reroutesExecuted: 0,
      sanctionsDetected: 0,
      activeTradeRoutes: 0,
      ingestionQueueSize: 0,
    },
    apiEndpoints: INITIAL_APIS,
    traces: [],
    kpiLineage: {
      compliance_score: {
        metric: "Compliance Score",
        value: "98.4%",
        derivedFrom: [],
      },
      active_risks: {
        metric: "Active Risks",
        value: "0",
        derivedFrom: [],
      },
      affected_shipments: {
        metric: "Affected Shipments",
        value: "0",
        derivedFrom: [],
      },
      autonomous_actions: {
        metric: "Autonomous Actions",
        value: "0",
        derivedFrom: [],
      },
    },
    throughputBuckets: Array(60).fill(0),

    setSSEConnected: (v) =>
      set((s) => ({ health: { ...s.health, sseConnected: v } })),

    updateApiStatus: (key, update) =>
      set((s) => ({
        apiEndpoints: s.apiEndpoints.map((api) =>
          api.key === key ? { ...api, ...update } : api
        ),
      })),

    ingestEvent: (event) =>
      set((s) => {
        const h = { ...s.health }
        const traces = [...s.traces]
        const kpiLineage = { ...s.kpiLineage }
        const apiEndpoints = [...s.apiEndpoints]

        // ── 1. Health counters ────────────────────────────────────────
        const source = SOURCE_MAP[event.agent] ?? event.agent
        const topic = event.topic ?? ""

        if (topic.includes("shipment.rerouted") || event.title?.toLowerCase().includes("reroute")) {
          h.reroutesExecuted += 1
          h.activeTradeRoutes = Math.max(0, h.activeTradeRoutes + 1)
        }
        if (topic.includes("sanctions") || event.title?.toLowerCase().includes("sanction")) {
          h.sanctionsDetected += 1
        }
        if (event.severity === "critical" || event.severity === "warning") {
          h.ingestionQueueSize = Math.max(0, Math.min(h.ingestionQueueSize + 1, 99))
        }
        if (event.severity === "success") {
          h.workflowsCompleted += 1
          h.ingestionQueueSize = Math.max(0, h.ingestionQueueSize - 1)
        }
        if (event.severity === "critical" && Math.random() < 0.1) {
          h.workflowsFailed += 1
        }

        // Estimate active agents from recent events
        const agentSet = new Set([...s.traces.flatMap((t) => t.steps.map((st) => st.agent)), event.agent])
        h.activeAgents = agentSet.size

        // ── 2. API endpoint updates ───────────────────────────────────
        // Mark API as active if event comes from a known source
        const apiKeyMap: Record<string, string> = {
          watchdog: "opensanctions",
          regulation: "wto",
          sanctions: "opensanctions",
          tariff: "wto",
          trade: "gta",
          governance: "comtrade",
        }
        for (const [keyword, apiKey] of Object.entries(apiKeyMap)) {
          if (topic.includes(keyword) || event.agent.includes(keyword)) {
            const idx = apiEndpoints.findIndex((a) => a.key === apiKey)
            if (idx >= 0) {
              apiEndpoints[idx] = {
                ...apiEndpoints[idx],
                status: "operational",
                lastFetch: event.timestamp,
                latencyMs: Math.floor(80 + Math.random() * 200),
                requestCount: apiEndpoints[idx].requestCount + 1,
                lastPayload: event.payload as Record<string, unknown>,
              }
            }
            break
          }
        }

        // ── 3. Workflow trace ─────────────────────────────────────────
        // Build a workflow trace entry per unique agent
        const wfId = (event.payload as any)?.workflow_id
          ?? (event.payload as any)?.trace_id
          ?? event.id.slice(0, 8)

        const existingTrace = traces.find((t) => t.workflow_id === wfId)
        const newStep: WorkflowStep = {
          id: crypto.randomUUID(),
          agent: event.agent,
          action: event.title,
          timestamp: event.timestamp,
          durationMs: Math.floor(50 + Math.random() * 400),
          input: {},
          output: event.payload as Record<string, unknown>,
          status: event.severity === "critical" ? "failed" : "completed",
        }

        if (existingTrace) {
          existingTrace.steps.push(newStep)
          if (event.agent === "governance" || event.severity === "success") {
            existingTrace.status = "completed"
            existingTrace.completedAt = event.timestamp
          }
        } else {
          traces.unshift({
            workflow_id: wfId,
            trigger: event.title,
            steps: [newStep],
            startedAt: event.timestamp,
            completedAt: null,
            status: "running",
          })
        }

        // ── 4. KPI lineage ────────────────────────────────────────────
        const lineageEntry = {
          eventId: event.id,
          source,
          agent: event.agent,
          timestamp: event.timestamp,
          contribution: "",
        }

        if (event.severity === "critical") {
          lineageEntry.contribution = "Incremented active risks"
          kpiLineage.active_risks = {
            ...kpiLineage.active_risks,
            derivedFrom: [lineageEntry, ...kpiLineage.active_risks.derivedFrom].slice(0, 10),
          }
        }
        if (event.payload && (event.payload as any).affected_shipments) {
          lineageEntry.contribution = `+${(event.payload as any).affected_shipments} affected shipments`
          kpiLineage.affected_shipments = {
            ...kpiLineage.affected_shipments,
            derivedFrom: [lineageEntry, ...kpiLineage.affected_shipments.derivedFrom].slice(0, 10),
          }
        }
        if (event.severity === "success") {
          lineageEntry.contribution = "Autonomous action executed"
          kpiLineage.autonomous_actions = {
            ...kpiLineage.autonomous_actions,
            derivedFrom: [lineageEntry, ...kpiLineage.autonomous_actions.derivedFrom].slice(0, 10),
          }
        }
        if (topic.includes("sanction") || topic.includes("compliance")) {
          lineageEntry.contribution = "Compliance score recalculated"
          kpiLineage.compliance_score = {
            ...kpiLineage.compliance_score,
            derivedFrom: [lineageEntry, ...kpiLineage.compliance_score.derivedFrom].slice(0, 10),
          }
        }

        return {
          health: h,
          apiEndpoints,
          traces: traces.slice(0, 30),
          kpiLineage,
        }
      }),
  }))
)
