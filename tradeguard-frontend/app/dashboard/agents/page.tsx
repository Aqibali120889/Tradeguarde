"use client"

import React, { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore } from "@/stores/agent-store"
import { useLiveStore } from "@/stores/live-store"
import { ExecutionFeed, AgentInspector } from "@/components/agents/execution-feed"
import {
  MessageSquare, Share2, Terminal, Activity,
  Radio, Monitor, Wifi, WifiOff
} from "lucide-react"

// ── Dynamic imports (no SSR) ───────────────────────────────────────────────
const AgentNetwork       = dynamic(() => import("@/components/agents/agent-network"),        { ssr: false })
const OrchestrationGraph = dynamic(() => import("@/components/agents/orchestration-graph"),  { ssr: false })
const AgentChat          = dynamic(() => import("@/components/agents/agent-chat"),            { ssr: false })
const HeartbeatMonitor   = dynamic(() => import("@/components/agents/heartbeat-monitor"),     { ssr: false })
const AgentTerminal      = dynamic(() => import("@/components/agents/agent-terminal"),        { ssr: false })

// ── Tab types ──────────────────────────────────────────────────────────────
type CenterTab = "chat" | "graph" | "terminal" | "heartbeat"
type RightTab  = "feed" | "monitor"

// ── Stat item (Command Bar) ────────────────────────────────────────────────
function StatItem({ label, value, valueClass }: {
  label: string
  value: string | number
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline gap-2 px-4 border-r border-white/[0.05] last:border-r-0">
      {/* Label: readable secondary — #94A3B8 passes AA on dark surfaces */}
      <span className="text-[10px] font-medium text-[#94A3B8] tracking-wider">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums font-mono ${valueClass || "text-[#E2E8F0]"}`}>
        {value}
      </span>
    </div>
  )
}

// ── Top command bar ────────────────────────────────────────────────────────
function CommandBar() {
  const agents    = useAgentStore(s => s.agents)
  const connected = useLiveStore(s => s.connected)
  const events    = useLiveStore(s => s.events)
  const kpi       = useLiveStore(s => s.kpi)

  const activeCount = agents.filter(a => a.status !== "idle" && a.status !== "waiting").length

  return (
    <div className="shrink-0 flex items-center h-10 px-4 border-b border-[#ffffff08]" style={{ background: "var(--surface-base)" }}>
      {/* Page title */}
      <div className="flex items-center gap-2.5 pr-4 mr-2 border-r border-[#ffffff08]">
        {/* Page title — clearly visible */}
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#CBD5E1]">
          Agent Command Center
        </span>
      </div>

      {/* Stats */}
      <StatItem label="Agents" value={`${agents.length}/6`} valueClass="text-[#22C55E]" />
      <StatItem label="Active" value={activeCount} valueClass="text-[#3B82F6]" />
      <StatItem label="Events" value={events.length} valueClass="text-[#CBD5E1]" />
      <StatItem label="Autonomous Ops" value={kpi.autonomous_actions} valueClass="text-[#22C55E]" />
      <StatItem label="Compliance" value={`${kpi.compliance_score.toFixed(1)}%`} valueClass="text-[#F59E0B]" />
      <StatItem label="Risks" value={kpi.active_risks} valueClass={kpi.active_risks > 0 ? "text-[#EF4444]" : "text-[#64748B]"} />

      {/* Connection badge */}
      <div className="ml-auto flex items-center gap-1.5">
        {connected ? (
          <>
            <Wifi className="size-3 text-[#22C55E]" />
            <span className="text-[10px] font-mono text-[#22C55E]">Live</span>
          </>
        ) : (
          <>
            <WifiOff className="size-3 text-[#EF4444]" />
            <span className="text-[10px] font-mono text-[#EF4444]">Reconnecting</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Workflow Timeline ──────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { label: "Regulation Detected", agent: "watchdog",      colorClass: "text-[#3B82F6]",  activeClass: "bg-[#3B82F6]/8 border-[#3B82F6]/30" },
  { label: "Risk Analyzed",        agent: "impact",        colorClass: "text-[#8B5CF6]",  activeClass: "bg-[#8B5CF6]/8 border-[#8B5CF6]/30" },
  { label: "Route Optimized",      agent: "planner",       colorClass: "text-[#8B5CF6]",  activeClass: "bg-[#8B5CF6]/8 border-[#8B5CF6]/30" },
  { label: "Execution Triggered",  agent: "execution",     colorClass: "text-[#22C55E]",  activeClass: "bg-[#22C55E]/8 border-[#22C55E]/30" },
  { label: "Governance Approved",  agent: "governance",    colorClass: "text-[#F59E0B]",  activeClass: "bg-[#F59E0B]/8 border-[#F59E0B]/30" },
  { label: "Partner Notified",     agent: "communication", colorClass: "text-[#06B6D4]",  activeClass: "bg-[#06B6D4]/8 border-[#06B6D4]/30" },
]

function WorkflowTimeline() {
  const agents      = useAgentStore(s => s.agents)
  const liveEvents  = useLiveStore(s => s.events)
  const recentAgent = liveEvents[0]?.agent?.toLowerCase()

  return (
    <div
      className="shrink-0 flex items-center gap-0 px-4 h-9 overflow-x-auto border-b border-[#ffffff06]"
      style={{ background: "var(--surface-base)" }}
    >
      {/* "Pipeline" label — visible secondary */}
      <span className="text-[9px] font-semibold text-[#64748B] tracking-[0.15em] uppercase mr-4 shrink-0 whitespace-nowrap">
        Pipeline
      </span>
      {WORKFLOW_STEPS.map((step, i) => {
        const agent    = agents.find(a => a.id === step.agent)
        const isActive = agent?.active ?? (recentAgent?.includes(step.agent) ?? false)
        const isDone   = (agent?.eventCount ?? 0) > 0

        return (
          <React.Fragment key={step.label}>
            <div
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded border transition-colors duration-300 ${
                isActive
                  ? step.activeClass
                  : "bg-transparent border-[#ffffff08]"
              }`}
            >
              {/* Pipeline step — inactive uses #64748B for WCAG AA readability */}
              <span className={`text-[10px] font-medium whitespace-nowrap transition-colors duration-300 ${
                isActive ? step.colorClass : "text-[#64748B]"
              }`}>
                {step.label}
              </span>
              {isDone && (
                <span className="text-[#22C55E] text-[9px] font-bold">✓</span>
              )}
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className="mx-1.5 w-4 h-px shrink-0 bg-[#ffffff0a]" />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── SSE Bridge ────────────────────────────────────────────────────────────
function useLiveBridge() {
  const updateFromLiveEvent = useAgentStore(s => s.updateFromLiveEvent)
  const liveEvents = useLiveStore(s => s.events)
  const prevLen = useRef(0)

  // Deactivate agents after 4s silence
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      const store = useAgentStore.getState()
      store.agents.forEach(a => {
        if (a.active && now - a.lastActiveTs > 4000) {
          useAgentStore.setState(state => ({
            agents: state.agents.map(ag =>
              ag.id === a.id ? { ...ag, active: false } : ag
            ),
          }))
        }
      })
      store.edges.forEach(e => {
        if (e.active && now - e.pulseTs > 2500) {
          useAgentStore.setState(state => ({
            edges: state.edges.map(ed =>
              ed.from === e.from && ed.to === e.to ? { ...ed, active: false } : ed
            ),
          }))
        }
      })
    }, 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (liveEvents.length > prevLen.current) {
      const newest = liveEvents[0]
      updateFromLiveEvent({
        agent:    newest.agent,
        severity: newest.severity,
        title:    newest.title,
        summary:  newest.summary,
      })
      prevLen.current = liveEvents.length
    }
  }, [liveEvents, updateFromLiveEvent])
}

// ── Tab button ─────────────────────────────────────────────────────────────
function TabBtn({
  label, icon: Icon, active, onClick, badge,
}: {
  label: string
  icon: React.ElementType
  active: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-full text-[10px] font-medium tracking-wide border-b-2 transition-colors duration-150 ${
        active
          ? "border-[#3B82F6] text-[#60A5FA] bg-[#3B82F6]/5"
          : "border-transparent text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-[rgba(255,255,255,0.03)]"
      }`}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-[#EF4444]/15 text-[#EF4444]">
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  useLiveBridge()
  const [centerTab, setCenterTab] = useState<CenterTab>("chat")
  const [rightTab, setRightTab]   = useState<RightTab>("feed")
  const criticalCount = useLiveStore(s => s.alerts.length)

  return (
    <div
      className="flex flex-col w-full flex-1 overflow-hidden"
      style={{ background: "var(--surface-base)" }}
    >
      {/* Command Bar */}
      <CommandBar />

      {/* Workflow Pipeline */}
      <WorkflowTimeline />

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Agent Network (268px) */}
        <div
          className="shrink-0 overflow-hidden border-r border-[#ffffff07]"
          style={{ width: 268 }}
        >
          <AgentNetwork />
        </div>

        {/* CENTER — Tabbed workspace */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {/* Tab bar */}
          <div
            className="shrink-0 flex items-stretch h-9 border-b border-[#ffffff07]"
            style={{ background: "var(--surface-base)" }}
          >
            <TabBtn label="Chat"      icon={MessageSquare} active={centerTab === "chat"}      onClick={() => setCenterTab("chat")} />
            <TabBtn label="Graph"     icon={Share2}        active={centerTab === "graph"}     onClick={() => setCenterTab("graph")} />
            <TabBtn label="Terminal"  icon={Terminal}      active={centerTab === "terminal"}  onClick={() => setCenterTab("terminal")} badge={criticalCount > 0 ? criticalCount : undefined} />
            <TabBtn label="Heartbeat" icon={Activity}      active={centerTab === "heartbeat"} onClick={() => setCenterTab("heartbeat")} />

            <div className="ml-auto flex items-center gap-1.5 pr-3">
              <span className="size-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              {/* "Real-time" label — readable secondary text */}
              <span className="text-[9px] font-mono text-[#64748B]">Real-time</span>
            </div>
          </div>

          {/* Tab panels */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {centerTab === "chat" && (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
                  <AgentChat />
                </motion.div>
              )}
              {centerTab === "graph" && (
                <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
                  <OrchestrationGraph />
                </motion.div>
              )}
              {centerTab === "terminal" && (
                <motion.div key="terminal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
                  <AgentTerminal />
                </motion.div>
              )}
              {centerTab === "heartbeat" && (
                <motion.div key="heartbeat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
                  <HeartbeatMonitor />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT — Feed/Monitor (288px) */}
        <div
          className="shrink-0 flex flex-col overflow-hidden border-l border-[#ffffff07]"
          style={{ width: 288, background: "var(--surface-base)" }}
        >
          {/* Right tab bar */}
          <div className="shrink-0 flex items-stretch h-9 border-b border-[#ffffff07]">
            <TabBtn label="Feed"    icon={Radio}    active={rightTab === "feed"}    onClick={() => setRightTab("feed")} />
            <TabBtn label="Monitor" icon={Monitor}  active={rightTab === "monitor"} onClick={() => setRightTab("monitor")} />
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === "feed"    && <ExecutionFeed />}
            {rightTab === "monitor" && <HeartbeatMonitor />}
          </div>
        </div>

      </div>

      {/* Agent Inspector */}
      <AgentInspector />
    </div>
  )
}
