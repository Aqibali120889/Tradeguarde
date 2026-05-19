"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useHeartbeatMonitor } from "@/hooks/useHeartbeatMonitor"
import { useAgentStore, type AgentId } from "@/stores/agent-store"
import type { HeartbeatData } from "@/hooks/useHeartbeatMonitor"
import { ChevronDown, ChevronRight, Wifi, WifiOff } from "lucide-react"

// ── Config ─────────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  watchdog: "👁", impact: "📊", planner: "🧠",
  execution: "⚡", governance: "⚖️", communication: "📡",
}

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  watchdog:      "Regulatory Watchdog",
  impact:        "Impact Analyzer",
  planner:       "Action Planner",
  execution:     "Execution Agent",
  governance:    "Governance Agent",
  communication: "Communication Agent",
}

const STATUS_STYLE: Record<string, { dot: string; text: string; label: string; bg: string }> = {
  active:  { dot: "#4ADE80", text: "#4ADE80", label: "Active",  bg: "rgba(34,197,94,0.07)"  },
  standby: { dot: "#64748B", text: "#94A3B8", label: "Standby", bg: "transparent"            },
  error:   { dot: "#F87171", text: "#F87171", label: "Error",   bg: "rgba(239,68,68,0.07)"  },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(isoStr?: string): string {
  if (!isoStr) return "—"
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 5) return "just now"
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function latencyColor(ms: number): string {
  if (ms === 0) return "#64748B"
  if (ms > 500) return "#F87171"
  if (ms > 300) return "#FBBF24"
  return "#4ADE80"
}

// ── Metric Row ─────────────────────────────────────────────────────────────

function MetricRow({ label, value, valueColor }: {
  label: string
  value: string | number
  valueColor?: string
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      {/* Label must be clearly readable — not too dim */}
      <span className="text-[10px] text-[#64748B]">{label}</span>
      <span
        className="text-[10px] font-semibold font-mono tabular-nums"
        style={{ color: valueColor || "#CBD5E1" }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Agent Card ─────────────────────────────────────────────────────────────

function AgentHeartbeatCard({ agentId, hb }: { agentId: AgentId; hb?: HeartbeatData }) {
  const agents  = useAgentStore(s => s.agents)
  const agent   = agents.find(a => a.id === agentId)
  const [expanded, setExpanded] = useState(false)

  const status    = hb?.status || (agent?.active ? "active" : "standby")
  const style     = STATUS_STYLE[status] || STATUS_STYLE.standby
  const icon      = AGENT_ICONS[agentId] || "🤖"
  const name      = AGENT_DISPLAY_NAMES[agentId] || agentId
  const latency   = hb?.latency_ms ?? 0
  const events    = hb?.events_processed ?? agent?.eventCount ?? 0
  const workflows = hb?.workflow_count ?? 0
  const memory    = hb?.memory_mb ?? 0
  const apiRate   = hb?.api_calls_per_min ?? 0
  const uptime    = hb?.uptime_pct ?? 0
  const tools     = hb?.tools_active || agent?.toolsUsed || []
  const lastSeen  = timeAgo(hb?.last_execution || (agent ? new Date(agent.lastActiveTs).toISOString() : undefined))

  return (
    <div
      className="rounded-lg border overflow-hidden cursor-pointer transition-all duration-150"
      style={{
        background: style.bg,
        borderColor: status === "active"
          ? "rgba(34,197,94,0.2)"
          : "rgba(255,255,255,0.07)",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="relative shrink-0">
          <span className="text-base leading-none">{icon}</span>
          <span
            className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[#0D1525]"
            style={{ background: style.dot }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            {/* Agent name — must be clearly visible */}
            <p className="text-[11px] font-semibold text-[#E2E8F0] truncate">{name}</p>
            <span className="text-[9.5px] font-medium shrink-0" style={{ color: style.text }}>
              {style.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-[9px] font-mono tabular-nums"
              style={{ color: latencyColor(latency) }}
            >
              {latency > 0 ? `${latency}ms` : "—"}
            </span>
            <span className="size-px rounded-full bg-[#334155]" />
            {/* Events count — clearly readable secondary text */}
            <span className="text-[9px] text-[#64748B] tabular-nums">{events} events</span>
            <span className="size-px rounded-full bg-[#334155]" />
            <span className="text-[9px] text-[#64748B] tabular-nums">{lastSeen}</span>
          </div>
        </div>

        {expanded
          ? <ChevronDown className="size-3.5 text-[#64748B] shrink-0" />
          : <ChevronRight className="size-3.5 text-[#64748B] shrink-0" />
        }
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-[rgba(255,255,255,0.06)] space-y-0.5">
              <MetricRow label="Events processed" value={events} />
              <MetricRow label="Active workflows"  value={workflows} />
              <MetricRow label="Avg latency"       value={latency > 0 ? `${latency}ms` : "—"} valueColor={latencyColor(latency)} />
              {memory > 0 && <MetricRow label="Memory"       value={`${memory.toFixed(1)} MB`} />}
              {apiRate > 0 && <MetricRow label="API calls/min" value={apiRate.toFixed(1)} />}
              {uptime > 0  && <MetricRow label="Uptime"       value={`${uptime.toFixed(1)}%`} valueColor="#4ADE80" />}

              {tools.length > 0 && (
                <div className="pt-1.5">
                  <p className="text-[9px] text-[#64748B] mb-1">Tools</p>
                  <div className="flex flex-wrap gap-1">
                    {tools.map(t => (
                      <span
                        key={t}
                        className="text-[8.5px] font-mono px-1.5 py-0.5 rounded text-[#94A3B8]"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[8.5px] text-[#475569] font-mono pt-1.5">
                {hb ? "Source: /api/agents/heartbeat" : "Source: derived from event stream"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function HeartbeatMonitor() {
  const { heartbeats, isLive } = useHeartbeatMonitor()
  const AGENT_IDS: AgentId[] = ["watchdog", "impact", "planner", "execution", "governance", "communication"]

  const activeCount = AGENT_IDS.filter(id => heartbeats[id]?.status === "active").length
  const totalEvents = AGENT_IDS.reduce((sum, id) => sum + (heartbeats[id]?.events_processed ?? 0), 0)
  const latencies   = AGENT_IDS.map(id => heartbeats[id]?.latency_ms ?? 0).filter(l => l > 0)
  const avgLatency  = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--surface-base)" }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.07)]"
      >
        <div>
          <div className="flex items-center gap-1.5">
            {isLive
              ? <Wifi className="size-3 text-[#4ADE80]" />
              : <WifiOff className="size-3 text-[#FBBF24]" />
            }
            {/* Panel title — clearly readable */}
            <p className="text-[11px] font-semibold text-[#E2E8F0]">Agent Heartbeat</p>
          </div>
          <p className="text-[9px] text-[#64748B] font-mono mt-0.5">
            {isLive ? "/api/agents/heartbeat · 5s poll" : "Derived from event stream"}
          </p>
        </div>

        <div
          className="px-2 py-1 rounded text-[10px] font-semibold"
          style={{
            background: "rgba(34,197,94,0.1)",
            color: "#4ADE80",
            border: "1px solid rgba(34,197,94,0.22)",
          }}
        >
          {activeCount}/{AGENT_IDS.length} active
        </div>
      </div>

      {/* Agent cards */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5">
        {AGENT_IDS.map(id => (
          <AgentHeartbeatCard
            key={id}
            agentId={id}
            hb={heartbeats[id] as HeartbeatData | undefined}
          />
        ))}
      </div>

      {/* Footer summary */}
      <div className="shrink-0 px-3 pb-3">
        <div
          className="rounded-lg px-3 py-2.5 border border-[rgba(255,255,255,0.07)]"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              {/* Label — clearly visible */}
              <p className="text-[9px] text-[#64748B] mb-0.5">Total events</p>
              <p className="text-[13px] font-semibold text-[#CBD5E1] tabular-nums">{totalEvents}</p>
            </div>
            <div>
              <p className="text-[9px] text-[#64748B] mb-0.5">Avg latency</p>
              <p
                className="text-[13px] font-semibold tabular-nums"
                style={{ color: latencyColor(avgLatency) }}
              >
                {avgLatency > 0 ? `${avgLatency}ms` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
