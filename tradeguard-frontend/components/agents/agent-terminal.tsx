"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore } from "@/stores/agent-store"
import { useLiveStore } from "@/stores/live-store"

// Enterprise color palette — readable on dark surfaces
const SEV_COLOR: Record<string, string> = {
  info:     "#60A5FA", // blue-400
  warning:  "#FBBF24", // amber-400
  critical: "#F87171", // red-400
  success:  "#4ADE80", // green-400
}

const AGENT_COLOR: Record<string, string> = {
  watchdog:      "#60A5FA",
  impact:        "#A78BFA",
  planner:       "#A78BFA",
  execution:     "#4ADE80",
  governance:    "#FBBF24",
  communication: "#60A5FA",
  system:        "#94A3B8",
}

function ts(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

type FilterType = "all" | "critical" | "warning" | "success" | "info"

const FILTER_LABELS: Record<FilterType, string> = {
  all: "ALL",
  critical: "CRIT",
  warning: "WARN",
  success: "OK",
  info: "INFO",
}

interface LogLine {
  id: string
  timestamp: string
  agentId: string
  agentName: string
  action: string
  severity: string
  workflowId?: string
  eventSource?: string
  raw?: Record<string, unknown>
}

function TerminalLine({ line }: { line: LogLine }) {
  const [expanded, setExpanded] = useState(false)
  const color = SEV_COLOR[line.severity] || "#60A5FA"
  const agentColor = AGENT_COLOR[line.agentId] || "#94A3B8"

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      className="group"
    >
      <div
        className="flex items-start gap-2 px-3 py-1.5 hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors duration-100"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Timestamp — always readable */}
        <span className="text-[9px] font-mono text-[#475569] shrink-0 mt-0.5 select-none tabular-nums">
          {ts(line.timestamp)}
        </span>

        {/* Severity dot */}
        <span className="size-1.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />

        {/* Agent name */}
        <span className="text-[9px] font-mono font-semibold shrink-0" style={{ color: agentColor }}>
          [{line.agentName.toUpperCase().slice(0, 8)}]
        </span>

        {/* Severity tag */}
        <span
          className="text-[8px] font-mono font-semibold px-1 py-0.5 rounded shrink-0"
          style={{ background: `${color}14`, color }}
        >
          {line.severity.toUpperCase()}
        </span>

        {/* Action — main content, must be clearly readable */}
        <span className="text-[10px] text-[#CBD5E1] flex-1 min-w-0 leading-snug">
          {line.action}
        </span>

        {/* Expand indicator */}
        {line.workflowId && (
          <span className="text-[8px] text-[#475569] shrink-0 group-hover:text-[#64748B] transition-colors select-none">
            {expanded ? "▲" : "▶"}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && line.workflowId && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden mx-3 mb-1"
          >
            <div
              className="rounded-lg px-3 py-2 text-[9px] font-mono space-y-0.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {line.workflowId && (
                <div className="flex gap-2">
                  <span className="text-[#475569]">WORKFLOW</span>
                  <span style={{ color: "#4ADE80" }}>{line.workflowId}</span>
                </div>
              )}
              {line.eventSource && (
                <div className="flex gap-2">
                  <span className="text-[#475569]">SOURCE</span>
                  <span style={{ color: "#60A5FA" }}>{line.eventSource}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-[#475569]">AGENT</span>
                <span style={{ color: agentColor }}>{line.agentId}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function AgentTerminal() {
  const executionFeed = useAgentStore(s => s.executionFeed)
  const liveEvents = useLiveStore(s => s.events)
  const connected = useLiveStore(s => s.connected)

  const [filter, setFilter] = useState<FilterType>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Merge execution feed + live SSE events into unified terminal log
  const terminalLines: LogLine[] = React.useMemo(() => {
    const fromFeed: LogLine[] = executionFeed.map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      agentId: e.agentId,
      agentName: e.agentName,
      action: e.action,
      severity: e.severity,
    }))

    const fromEvents: LogLine[] = liveEvents.map(e => ({
      id: `evt-${e.id}`,
      timestamp: e.timestamp,
      agentId: e.agent?.toLowerCase() || "system",
      agentName: e.agent || "System",
      action: `${e.title}: ${e.summary}`,
      severity: e.severity,
      workflowId: (e.payload as Record<string, string>)?.workflow_id,
      eventSource: e.id,
    }))

    return [...fromFeed, ...fromEvents]
      .filter(line => {
        if (filter !== "all" && line.severity !== filter) return false
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          return (
            line.action.toLowerCase().includes(q) ||
            line.agentName.toLowerCase().includes(q) ||
            line.agentId.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 200)
  }, [executionFeed, liveEvents, filter, searchQuery])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [terminalLines, autoScroll])

  return (
    <div
      className="h-full flex flex-col font-mono"
      style={{ background: "#0D1117" }} // GitHub dark — professional terminal bg
    >
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <span
            className="size-2 rounded-full"
            style={{ background: connected ? "#4ADE80" : "#F87171" }}
          />
          <span className="text-[11px] font-semibold tracking-wide text-[#E2E8F0]">
            Agent Terminal
          </span>
          <span className="ml-auto text-[9px] font-mono text-[#475569] tabular-nums">
            {terminalLines.length} lines
          </span>
        </div>

        {/* Filter tabs + search */}
        <div className="flex items-center gap-1">
          {(["all", "critical", "warning", "success", "info"] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded transition-all duration-150"
              style={{
                background: filter === f
                  ? `${SEV_COLOR[f] || "rgba(148,163,184,0.2)"}18`
                  : "transparent",
                color: filter === f
                  ? (SEV_COLOR[f] || "#94A3B8")
                  : "#475569",
                border: `1px solid ${filter === f
                  ? `${SEV_COLOR[f] || "rgba(148,163,184,0.2)"}35`
                  : "transparent"}`,
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}

          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="search…"
            className="ml-auto text-[9px] text-[#94A3B8] outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 5,
              padding: "2px 8px",
              width: 90,
            }}
          />
        </div>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={e => {
          const el = e.currentTarget
          setAutoScroll(el.scrollTop < 50)
        }}
      >
        {terminalLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="size-5 rounded-full border border-[#3B82F6]/30 animate-spin border-t-[#3B82F6]/70" />
            <p className="text-[10px] font-mono text-[#475569]">
              {connected ? "Awaiting agent events…" : "Connecting to event stream…"}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {terminalLines.map(line => (
              <TerminalLine key={line.id} line={line} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-4 py-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between text-[8px] font-mono text-[#475569]">
          <span>
            SSE: {connected
              ? <span className="text-[#4ADE80]">✓ CONNECTED</span>
              : <span className="text-[#F87171]">✗ DISCONNECTED</span>
            }
          </span>
          <span>TRADEGUARD AGENT MESH</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="px-1.5 py-0.5 rounded transition-colors"
            style={{
              color: autoScroll ? "#4ADE80" : "#475569",
              border: `1px solid ${autoScroll ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            AUTOSCROLL {autoScroll ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </div>
  )
}
