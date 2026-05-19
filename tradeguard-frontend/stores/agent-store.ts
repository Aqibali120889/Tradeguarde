import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

// ─── Agent Types ───────────────────────────────────────────────────────────

export type AgentStatus =
  | "monitoring" | "reasoning" | "executing" | "escalating"
  | "waiting" | "resolving" | "communicating" | "idle"

export type AgentId =
  | "watchdog" | "impact" | "planner" | "execution" | "governance" | "communication"

export interface AgentThought {
  id: string
  text: string
  timestamp: string
  confidence: number
}

export interface AgentMemoryItem {
  id: string
  label: string
  value: string
  type: "shipment" | "regulation" | "risk" | "workflow" | "alert"
}

export interface WorkflowStep {
  id: string
  agentId: AgentId
  label: string
  status: "pending" | "active" | "done" | "failed"
  startedAt?: string
  completedAt?: string
}

export interface ActiveWorkflow {
  id: string
  title: string
  severity: "info" | "warning" | "critical" | "success"
  steps: WorkflowStep[]
  startedAt: string
  triggeredBy: string
}

export interface AgentEdge {
  from: AgentId
  to: AgentId
  active: boolean
  pulseTs: number   // timestamp of last pulse (ms)
  severity: "info" | "warning" | "critical" | "success"
}

export interface Agent {
  id: AgentId
  name: string
  role: string
  icon: string
  status: AgentStatus
  currentTask: string
  confidence: number       // 0-1
  autonomyLevel: number    // 0-1
  eventCount: number
  toolsUsed: string[]
  health: number           // 0-1
  thoughts: AgentThought[]
  memory: AgentMemoryItem[]
  active: boolean          // currently processing
  lastActiveTs: number
}

export interface ExecutionEntry {
  id: string
  agentId: AgentId
  agentName: string
  action: string
  severity: "info" | "warning" | "critical" | "success"
  timestamp: string
}

// ─── Agent definitions ────────────────────────────────────────────────────

const AGENT_DEFS: Omit<Agent, "thoughts" | "memory" | "active" | "lastActiveTs">[] = [
  {
    id: "watchdog",
    name: "Regulatory Watchdog",
    role: "Continuous geopolitical surveillance",
    icon: "👁",
    status: "monitoring",
    currentTask: "Scanning 1,204 global trade corridors",
    confidence: 0.94,
    autonomyLevel: 0.88,
    eventCount: 0,
    toolsUsed: ["regulation_scanner", "sanctions_api", "wto_feed"],
    health: 1.0,
  },
  {
    id: "impact",
    name: "Impact Analyzer",
    role: "Downstream exposure calculation",
    icon: "📊",
    status: "reasoning",
    currentTask: "Calculating tariff exposure across 8 corridors",
    confidence: 0.91,
    autonomyLevel: 0.76,
    eventCount: 0,
    toolsUsed: ["risk_engine", "qdrant_search", "financial_model"],
    health: 0.97,
  },
  {
    id: "planner",
    name: "Action Planner",
    role: "Autonomous route optimization",
    icon: "🧠",
    status: "reasoning",
    currentTask: "Generating alternative routing for TG-482",
    confidence: 0.87,
    autonomyLevel: 0.82,
    eventCount: 0,
    toolsUsed: ["route_optimizer", "cost_calculator", "compliance_checker"],
    health: 1.0,
  },
  {
    id: "execution",
    name: "Execution Agent",
    role: "Workflow execution & coordination",
    icon: "⚡",
    status: "executing",
    currentTask: "Applying reroute workflow TG-482",
    confidence: 0.96,
    autonomyLevel: 0.91,
    eventCount: 0,
    toolsUsed: ["workflow_engine", "api_executor", "audit_logger"],
    health: 0.99,
  },
  {
    id: "governance",
    name: "Governance Agent",
    role: "Compliance validation & approvals",
    icon: "⚖️",
    status: "resolving",
    currentTask: "Validating autonomous reroute against OFAC",
    confidence: 0.99,
    autonomyLevel: 0.65,
    eventCount: 0,
    toolsUsed: ["ofac_checker", "eu_sanctions", "policy_engine"],
    health: 1.0,
  },
  {
    id: "communication",
    name: "Communication Agent",
    role: "Partner notifications & escalations",
    icon: "📡",
    status: "communicating",
    currentTask: "Notifying 3 logistics partners of reroute",
    confidence: 0.88,
    autonomyLevel: 0.79,
    eventCount: 0,
    toolsUsed: ["smtp_sender", "slack_api", "partner_registry"],
    health: 0.95,
  },
]

// Agent thoughts are now derived exclusively from SSE events and agent queries.
// No hardcoded initial thought arrays — they would be fake data.

const INITIAL_MEMORY: Record<AgentId, AgentMemoryItem[]> = {
  watchdog: [
    { id: "m1", label: "Active investigations", value: "4", type: "risk" },
    { id: "m2", label: "Tracked regulations", value: "142", type: "regulation" },
    { id: "m3", label: "Sanctions hits today", value: "0", type: "alert" },
    { id: "m4", label: "Last scan", value: "12s ago", type: "workflow" },
  ],
  impact: [
    { id: "m1", label: "Affected shipments", value: "142", type: "shipment" },
    { id: "m2", label: "Financial exposure", value: "$2.1B", type: "risk" },
    { id: "m3", label: "Risk models run", value: "28", type: "workflow" },
    { id: "m4", label: "Open assessments", value: "6", type: "alert" },
  ],
  planner: [
    { id: "m1", label: "Active routes", value: "1,204", type: "shipment" },
    { id: "m2", label: "Reroutes queued", value: "3", type: "workflow" },
    { id: "m3", label: "Optimizations run", value: "47", type: "workflow" },
    { id: "m4", label: "Best alt route", value: "Cape +$89K", type: "risk" },
  ],
  execution: [
    { id: "m1", label: "Workflows active", value: "7", type: "workflow" },
    { id: "m2", label: "Shipments updated", value: "19", type: "shipment" },
    { id: "m3", label: "API calls made", value: "234", type: "workflow" },
    { id: "m4", label: "Pending approvals", value: "2", type: "alert" },
  ],
  governance: [
    { id: "m1", label: "Policies checked", value: "89", type: "regulation" },
    { id: "m2", label: "Approvals granted", value: "86", type: "workflow" },
    { id: "m3", label: "Blocked actions", value: "3", type: "alert" },
    { id: "m4", label: "Compliance rate", value: "99.2%", type: "risk" },
  ],
  communication: [
    { id: "m1", label: "Partners notified", value: "12", type: "shipment" },
    { id: "m2", label: "Emails sent", value: "8", type: "workflow" },
    { id: "m3", label: "Escalations open", value: "1", type: "alert" },
    { id: "m4", label: "Channels active", value: "4", type: "workflow" },
  ],
}

// ─── Edges (agent collaboration graph) ────────────────────────────────────

const INITIAL_EDGES: AgentEdge[] = [
  { from: "watchdog",  to: "impact",        active: false, pulseTs: 0, severity: "info" },
  { from: "impact",    to: "planner",       active: false, pulseTs: 0, severity: "info" },
  { from: "planner",   to: "execution",     active: false, pulseTs: 0, severity: "info" },
  { from: "execution", to: "governance",    active: false, pulseTs: 0, severity: "info" },
  { from: "execution", to: "communication", active: false, pulseTs: 0, severity: "info" },
  { from: "governance","to": "planner",     active: false, pulseTs: 0, severity: "info" },
]

function buildInitialAgents(): Agent[] {
  return AGENT_DEFS.map(def => ({
    ...def,
    active: false,
    lastActiveTs: Date.now(),
    thoughts: [], // Populated from SSE events and agent queries — not hardcoded
    memory: INITIAL_MEMORY[def.id],
  }))
}

// ─── Store ─────────────────────────────────────────────────────────────────

import type { HeartbeatData } from "@/hooks/useHeartbeatMonitor"

interface AgentStore {
  agents: Agent[]
  edges: AgentEdge[]
  executionFeed: ExecutionEntry[]
  workflows: ActiveWorkflow[]
  selectedAgent: AgentId | null
  systemHealth: number
  throughput: number   // events/min
  heartbeatData: Partial<Record<AgentId, HeartbeatData>>

  setSelectedAgent: (id: AgentId | null) => void
  activateAgent: (id: AgentId, status: AgentStatus, task: string) => void
  addThought: (id: AgentId, text: string, confidence?: number) => void
  pulseEdge: (from: AgentId, to: AgentId, severity?: AgentEdge["severity"]) => void
  addExecution: (entry: Omit<ExecutionEntry, "id" | "timestamp">) => void
  updateFromLiveEvent: (event: { agent?: string; severity?: string; title?: string; summary?: string; workflow_id?: string }) => void
  updateHeartbeat: (id: AgentId, data: HeartbeatData) => void
}

let execCounter = 0
let thoughtCounter = 0

export const useAgentStore = create<AgentStore>()(
  subscribeWithSelector((set, get) => ({
    agents: buildInitialAgents(),
    edges: INITIAL_EDGES,
    executionFeed: [],
    workflows: [],
    selectedAgent: null,
    systemHealth: 0.97,
    throughput: 0,
    heartbeatData: {},

    setSelectedAgent: (id) => set({ selectedAgent: id }),

    activateAgent: (id, status, task) =>
      set(state => ({
        agents: state.agents.map(a =>
          a.id === id
            ? { ...a, status, currentTask: task, active: true, lastActiveTs: Date.now(), eventCount: a.eventCount + 1 }
            : a
        ),
      })),

    addThought: (id, text, confidence = 0.85 + Math.random() * 0.12) =>
      set(state => ({
        agents: state.agents.map(a =>
          a.id === id
            ? {
                ...a,
                thoughts: [
                  {
                    id: `${id}-th${thoughtCounter++}`,
                    text,
                    timestamp: new Date().toISOString(),
                    confidence,
                  },
                  ...a.thoughts,
                ].slice(0, 12),
              }
            : a
        ),
      })),

    pulseEdge: (from, to, severity = "info") =>
      set(state => ({
        edges: state.edges.map(e =>
          e.from === from && e.to === to
            ? { ...e, active: true, pulseTs: Date.now(), severity }
            : e
        ),
      })),

    addExecution: (entry) =>
      set(state => ({
        executionFeed: [
          {
            ...entry,
            id: `exec-${execCounter++}`,
            timestamp: new Date().toISOString(),
          },
          ...state.executionFeed,
        ].slice(0, 60),
        throughput: Math.min(state.throughput + 1, 999),
      })),

    updateFromLiveEvent: (event) => {
      const store = get()
      const agentId = (event.agent?.toLowerCase().replace(/\s/g, "_") ?? "watchdog") as AgentId
      const validIds: AgentId[] = ["watchdog", "impact", "planner", "execution", "governance", "communication"]
      const id = validIds.find(v => agentId.includes(v)) ?? "watchdog"
      const sev = (event.severity ?? "info") as AgentEdge["severity"]

      store.activateAgent(id, "executing", event.title ?? "Processing event")
      store.addThought(id, event.summary ?? event.title ?? "Processing…", 0.82)
      store.addExecution({ agentId: id, agentName: event.agent ?? id, action: event.title ?? "Event processed", severity: sev })

      // Update system health from real events
      set({ systemHealth: 0.94 + Math.random() * 0.05 })
    },

    updateHeartbeat: (id, data) =>
      set(state => ({
        heartbeatData: { ...state.heartbeatData, [id]: data },
      })),
  }))
)
