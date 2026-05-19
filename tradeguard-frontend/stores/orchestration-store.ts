import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

// ─── Types ─────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "agent" | "system"

export interface AgentChatMessage {
  id: string
  role: MessageRole
  agent?: string          // agent id (watchdog, impact, etc.)
  agentName?: string
  agentIcon?: string
  content: string
  reasoning?: string
  toolsCalled?: string[]
  confidence?: number
  timestamp: string
  workflowId?: string
  eventSource?: string    // originating event id / query id
  isStreaming?: boolean   // currently being typed out
}

export interface WorkflowStep {
  id: string
  agentId: string
  agentName: string
  agentIcon: string
  label: string
  status: "pending" | "active" | "done" | "failed"
  startedAt?: string
  completedAt?: string
  detail?: string
}

export interface LiveWorkflow {
  id: string                 // workflow_id from backend or SSE payload
  title: string
  severity: "info" | "warning" | "critical" | "success"
  steps: WorkflowStep[]
  startedAt: string
  triggeredBy: string        // "user_query" | event topic
  sourceEventId?: string
}

export interface QueryState {
  id: string
  query: string
  status: "sending" | "processing" | "done" | "error"
  agentsActive: string[]    // agent ids currently responding
  startedAt: string
}

// ─── Store ─────────────────────────────────────────────────────────────────

interface OrchestrationStore {
  // Chat
  messages: AgentChatMessage[]
  currentQuery: QueryState | null
  isProcessing: boolean

  // Workflows from SSE
  liveWorkflows: LiveWorkflow[]

  // Actions
  addUserMessage: (content: string) => string  // returns query id
  addAgentMessage: (msg: Omit<AgentChatMessage, "id" | "role">) => void
  setStreamingMessage: (id: string, content: string) => void
  completeStreaming: (id: string) => void
  setQueryState: (q: QueryState | null) => void
  setProcessing: (v: boolean) => void

  // Workflows from SSE
  addWorkflowStep: (workflowId: string, step: Omit<WorkflowStep, "id">) => void
  completeWorkflowStep: (workflowId: string, agentId: string) => void
  addWorkflowFromEvent: (event: {
    workflowId: string
    title: string
    severity: string
    agentId: string
    agentName: string
    agentIcon: string
    label: string
    eventId: string
    timestamp: string
    topic: string
  }) => void

  clearMessages: () => void
}

let msgCounter = 0

export const useOrchestrationStore = create<OrchestrationStore>()(
  subscribeWithSelector((set, get) => ({
    messages: [],
    currentQuery: null,
    isProcessing: false,
    liveWorkflows: [],

    addUserMessage: (content) => {
      const id = `msg-user-${msgCounter++}`
      const timestamp = new Date().toISOString()
      set(state => ({
        messages: [
          ...state.messages,
          { id, role: "user", content, timestamp },
        ],
      }))
      return id
    },

    addAgentMessage: (msg) => {
      const id = `msg-agent-${msgCounter++}`
      set(state => ({
        messages: [
          ...state.messages,
          { ...msg, id, role: "agent" },
        ],
      }))
    },

    setStreamingMessage: (id, content) =>
      set(state => ({
        messages: state.messages.map(m =>
          m.id === id ? { ...m, content, isStreaming: true } : m
        ),
      })),

    completeStreaming: (id) =>
      set(state => ({
        messages: state.messages.map(m =>
          m.id === id ? { ...m, isStreaming: false } : m
        ),
      })),

    setQueryState: (q) => set({ currentQuery: q }),
    setProcessing: (v) => set({ isProcessing: v }),

    addWorkflowFromEvent: (event) => {
      set(state => {
        const existing = state.liveWorkflows.find(w => w.id === event.workflowId)
        const step: WorkflowStep = {
          id: `step-${Date.now()}`,
          agentId: event.agentId,
          agentName: event.agentName,
          agentIcon: event.agentIcon,
          label: event.label,
          status: "done",
          startedAt: event.timestamp,
          completedAt: event.timestamp,
        }

        const sev = (["info", "warning", "critical", "success"].includes(event.severity)
          ? event.severity
          : "info") as LiveWorkflow["severity"]

        if (existing) {
          return {
            liveWorkflows: state.liveWorkflows.map(w =>
              w.id === event.workflowId
                ? { ...w, steps: [...w.steps, step] }
                : w
            ),
          }
        }

        const newWorkflow: LiveWorkflow = {
          id: event.workflowId,
          title: event.title,
          severity: sev,
          steps: [step],
          startedAt: event.timestamp,
          triggeredBy: event.topic,
          sourceEventId: event.eventId,
        }
        return {
          liveWorkflows: [newWorkflow, ...state.liveWorkflows].slice(0, 20),
        }
      })
    },

    addWorkflowStep: (workflowId, step) =>
      set(state => ({
        liveWorkflows: state.liveWorkflows.map(w =>
          w.id === workflowId
            ? {
                ...w,
                steps: [...w.steps, { ...step, id: `step-${Date.now()}` }],
              }
            : w
        ),
      })),

    completeWorkflowStep: (workflowId, agentId) =>
      set(state => ({
        liveWorkflows: state.liveWorkflows.map(w =>
          w.id === workflowId
            ? {
                ...w,
                steps: w.steps.map(s =>
                  s.agentId === agentId && s.status === "active"
                    ? { ...s, status: "done", completedAt: new Date().toISOString() }
                    : s
                ),
              }
            : w
        ),
      })),

    clearMessages: () => set({ messages: [], currentQuery: null }),
  }))
)
