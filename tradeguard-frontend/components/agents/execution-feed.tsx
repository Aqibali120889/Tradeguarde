"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore, type AgentId } from "@/stores/agent-store"

// ── Enterprise-grade color system ──────────────────────────────────────────
// Mapped to CSS variables where possible for theme consistency

const SEV_COLOR: Record<string, string> = {
  info:     "#60A5FA", // blue-400 — visible on dark, not over-saturated
  warning:  "#FBBF24", // amber-400 — warm, readable
  critical: "#F87171", // red-400 — clear danger, not neon
  success:  "#4ADE80", // green-400 — clean confirmation
}

const SEV_BG: Record<string, string> = {
  info:     "rgba(59,130,246,0.08)",
  warning:  "rgba(245,158,11,0.08)",
  critical: "rgba(239,68,68,0.08)",
  success:  "rgba(34,197,94,0.08)",
}

const SEV_BORDER: Record<string, string> = {
  info:     "rgba(59,130,246,0.2)",
  warning:  "rgba(245,158,11,0.2)",
  critical: "rgba(239,68,68,0.2)",
  success:  "rgba(34,197,94,0.2)",
}

function ts(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

// ─── Execution Feed ────────────────────────────────────────────────────────

type FeedFilter = "all" | "critical" | "success" | "warning"

export function ExecutionFeed() {
  const feed = useAgentStore(s => s.executionFeed)
  const [filter, setFilter] = useState<FeedFilter>("all")

  const filtered = filter === "all" ? feed : feed.filter(e => e.severity === filter)

  const filterBtns: { id: FeedFilter; label: string; color: string }[] = [
    { id: "all",      label: "ALL",  color: "#94A3B8" },
    { id: "critical", label: "CRIT", color: SEV_COLOR.critical },
    { id: "warning",  label: "WARN", color: SEV_COLOR.warning },
    { id: "success",  label: "OK",   color: SEV_COLOR.success },
  ]

  return (
    <div className="h-full flex flex-col border-l border-[rgba(255,255,255,0.07)]">
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "var(--surface-base)" }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <div className="relative">
            <span className="size-1.5 rounded-full bg-[#F87171] block" />
            <span className="size-1.5 rounded-full bg-[#F87171] absolute inset-0 animate-ping opacity-50" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#E2E8F0]">
            Execution Stream
          </span>
          <span
            className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: "rgba(239,68,68,0.12)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            {filtered.length}
          </span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {filterBtns.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded transition-all duration-150"
              style={{
                background: filter === f.id ? `${f.color}18` : "transparent",
                color: filter === f.id ? f.color : "#64748B",
                border: `1px solid ${filter === f.id ? `${f.color}35` : "transparent"}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5" style={{ background: "var(--surface-base)" }}>
        <AnimatePresence initial={false}>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-24 gap-2">
              <div className="size-5 rounded-full border border-[#3B82F6]/30 animate-spin border-t-[#3B82F6]/70" />
              <p className="text-[10px] font-mono text-[#64748B]">Awaiting agent events…</p>
            </div>
          )}
          {filtered.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: 8, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-lg px-2.5 py-2 overflow-hidden"
              style={{
                background: SEV_BG[entry.severity],
                border: `1px solid ${SEV_BORDER[entry.severity]}`,
              }}
            >
              <div className="flex items-start gap-2">
                <span className="size-1.5 rounded-full mt-1.5 shrink-0" style={{ background: SEV_COLOR[entry.severity] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span
                      className="text-[9px] font-mono font-semibold truncate"
                      style={{ color: SEV_COLOR[entry.severity] }}
                    >
                      {entry.agentName}
                    </span>
                    <span className="text-[9px] font-mono text-[#64748B] shrink-0 tabular-nums">
                      {ts(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#CBD5E1] leading-snug">{entry.action}</p>

                  {/* Source lineage */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[8px] font-mono text-[#475569]">
                      agent:{entry.agentId}
                    </span>
                    <span className="size-0.5 rounded-full bg-[#334155]" />
                    <span className="text-[8px] font-mono text-[#475569]">
                      {entry.id.slice(-8)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Agent Inspector Modal ─────────────────────────────────────────────────

const MEM_TYPE_COLOR: Record<string, string> = {
  shipment:   "#60A5FA",
  regulation: "#A78BFA",
  risk:       "#F87171",
  workflow:   "#4ADE80",
  alert:      "#FBBF24",
}

export function AgentInspector() {
  const selectedId    = useAgentStore(s => s.selectedAgent)
  const agents        = useAgentStore(s => s.agents)
  const setSelected   = useAgentStore(s => s.setSelectedAgent)
  const heartbeatData = useAgentStore(s => s.heartbeatData)

  const agent = selectedId ? agents.find(a => a.id === selectedId) : null
  const hb = selectedId ? heartbeatData[selectedId] : undefined

  return (
    <AnimatePresence>
      {agent && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(2,6,14,0.75)", backdropFilter: "blur(6px)" }}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 overflow-y-auto"
            style={{
              width: 460,
              background: "#111827",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Inspector header */}
            <div
              className="sticky top-0 z-10 px-5 py-4"
              style={{ background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{agent.icon}</span>
                <div>
                  <h2 className="text-sm font-semibold text-[#F1F5F9]">{agent.name}</h2>
                  <p className="text-[10px] font-mono text-[#64748B] mt-0.5">{agent.role}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="ml-auto size-7 rounded-lg flex items-center justify-center hover:bg-white/5 text-[#64748B] hover:text-[#CBD5E1] transition-colors"
                  aria-label="Close inspector"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Live heartbeat badge */}
              {hb && (
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="size-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                    <span className="text-[10px] font-mono text-[#4ADE80] font-semibold">
                      LIVE HEARTBEAT · /api/agents/heartbeat
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                    <div>
                      <span className="text-[#64748B] block mb-0.5">LATENCY</span>
                      <span className="text-[#CBD5E1] font-semibold">{hb.latency_ms}ms</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block mb-0.5">EVENTS</span>
                      <span className="text-[#CBD5E1] font-semibold">{hb.events_processed}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block mb-0.5">WORKFLOWS</span>
                      <span className="text-[#CBD5E1] font-semibold">{hb.workflow_count}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Confidence",  value: `${Math.round(agent.confidence * 100)}%`,    color: "#60A5FA" },
                  { label: "Autonomy",    value: `${Math.round(agent.autonomyLevel * 100)}%`, color: "#A78BFA" },
                  { label: "Events",      value: agent.eventCount,                            color: "#4ADE80" },
                ].map(m => (
                  <div
                    key={m.label}
                    className="rounded-lg px-3 py-2.5 text-center"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-[18px] font-bold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-[9px] font-mono text-[#64748B] mt-0.5">{m.label.toUpperCase()}</p>
                  </div>
                ))}
              </div>

              {/* Current Task */}
              <section>
                <SectionTitle>Current Objective</SectionTitle>
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
                >
                  <p className="text-[11px] text-[#CBD5E1] leading-relaxed">{agent.currentTask}</p>
                </div>
              </section>

              {/* Reasoning chain */}
              <section>
                <SectionTitle>Live Reasoning Chain</SectionTitle>
                {agent.thoughts.length === 0 ? (
                  <div
                    className="rounded-lg px-3 py-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p className="text-[10px] font-mono text-[#475569] text-center">
                      Thoughts appear as the agent processes SSE events…
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {agent.thoughts.slice(0, 6).map((t, i) => (
                      <div key={t.id} className="flex gap-2.5">
                        <div className="flex flex-col items-center">
                          <span className="size-1.5 rounded-full bg-[#3B82F6]/70 mt-1.5 shrink-0" />
                          {i < 5 && <div className="w-px flex-1 bg-[rgba(255,255,255,0.06)] mt-1" />}
                        </div>
                        <div className="flex-1 pb-2">
                          <p className="text-[10px] text-[#94A3B8] leading-snug">{t.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[8px] font-mono text-[#475569]">
                              {new Date(t.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                            <span className="text-[8px] font-mono text-[#A78BFA]">
                              {Math.round(t.confidence * 100)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Working memory */}
              <section>
                <SectionTitle>Working Memory</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {agent.memory.map(m => (
                    <div
                      key={m.id}
                      className="rounded-lg px-3 py-2.5"
                      style={{
                        background: "rgba(255,255,255,0.025)",
                        border: `1px solid ${MEM_TYPE_COLOR[m.type] || "#3B82F6"}20`,
                      }}
                    >
                      <p
                        className="text-[14px] font-bold tabular-nums"
                        style={{ color: MEM_TYPE_COLOR[m.type] || "#60A5FA" }}
                      >
                        {m.value}
                      </p>
                      <p className="text-[9px] font-mono text-[#64748B] mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Tools */}
              <section>
                <SectionTitle>Active Tools</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {agent.toolsUsed.map(tool => (
                    <span
                      key={tool}
                      className="text-[9px] font-mono px-2 py-1 rounded"
                      style={{
                        background: "rgba(59,130,246,0.08)",
                        color: "#60A5FA",
                        border: "1px solid rgba(59,130,246,0.2)",
                      }}
                    >
                      {tool.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </section>

              {/* Agent health */}
              <section>
                <SectionTitle>Agent Health</SectionTitle>
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="flex justify-between text-[9px] font-mono mb-1.5">
                    <span className="text-[#64748B]">HEALTH SCORE</span>
                    <span className="text-[#4ADE80] font-semibold">{Math.round(agent.health * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <motion.div
                      className="h-full rounded-full bg-[#22C55E]"
                      animate={{ width: `${agent.health * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-[8px] font-mono text-[#475569] mt-2">
                    Source: {hb ? "/api/agents/heartbeat" : "agent-store (derived from event stream)"}
                  </p>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
      <span className="text-[9px] font-mono font-semibold text-[#475569] tracking-[0.18em] uppercase">
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
    </div>
  )
}
