"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore, type Agent, type AgentId, type AgentStatus } from "@/stores/agent-store"

// ─── Status system — enterprise palette ────────────────────────────────────

const STATUS_CONFIG: Record<AgentStatus, {
  color: string
  bg: string
  border: string
  label: string
}> = {
  monitoring:    { color: "#60A5FA", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.22)",  label: "Monitoring"  },
  reasoning:     { color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.22)", label: "Reasoning"  },
  executing:     { color: "#4ADE80", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.22)",   label: "Executing"  },
  escalating:    { color: "#F87171", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.22)",   label: "Escalating" },
  waiting:       { color: "#64748B", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.18)", label: "Waiting"    },
  resolving:     { color: "#FBBF24", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)",  label: "Resolving"  },
  communicating: { color: "#22D3EE", bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.22)",   label: "Comms"      },
  idle:          { color: "#475569", bg: "transparent",            border: "rgba(255,255,255,0.07)", label: "Idle"       },
}

// ─── Progress bar ───────────────────────────────────────────────────────────

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  )
}

// ─── Agent card ─────────────────────────────────────────────────────────────

function AgentCard({ agent, selected, onClick }: {
  agent: Agent
  selected: boolean
  onClick: () => void
}) {
  const s = STATUS_CONFIG[agent.status]
  const isActive = agent.status !== "idle" && agent.status !== "waiting"

  return (
    <motion.div
      layout
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg cursor-pointer overflow-hidden border transition-all duration-150 hover:brightness-105"
      style={{
        background: selected ? s.bg : "rgba(255,255,255,0.02)",
        borderColor: selected ? s.border : "rgba(255,255,255,0.07)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        {/* Status dot + icon */}
        <div className="relative shrink-0">
          <span className="text-base leading-none">{agent.icon}</span>
          <span
            className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[#0D1525]"
            style={{ background: isActive ? s.color : "#334155" }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            {/* Agent name — must be clearly visible */}
            <p className="text-[11px] font-semibold text-[#E2E8F0] truncate">{agent.name}</p>
            <span
              className="text-[8.5px] font-medium px-1.5 py-0.5 rounded shrink-0 tabular-nums"
              style={{
                background: isActive ? s.bg : "transparent",
                color: isActive ? s.color : "#475569",
                border: `1px solid ${isActive ? s.border : "transparent"}`,
              }}
            >
              {s.label}
            </span>
          </div>
          {/* Role — secondary text, readable but soft */}
          <p className="text-[9.5px] text-[#64748B] truncate mt-0.5 font-mono">{agent.role}</p>
        </div>
      </div>

      {/* Current task */}
      <div className="px-3 pb-2">
        <p className="text-[10px] text-[#94A3B8] leading-relaxed line-clamp-1">{agent.currentTask}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-2">
        <div>
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-[#64748B]">Confidence</span>
            <span className="text-[#94A3B8] tabular-nums">{Math.round(agent.confidence * 100)}%</span>
          </div>
          <Bar value={agent.confidence} color={s.color} />
        </div>
        <div>
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-[#64748B]">Autonomy</span>
            <span className="text-[#94A3B8] tabular-nums">{Math.round(agent.autonomyLevel * 100)}%</span>
          </div>
          <Bar value={agent.autonomyLevel} color="#A78BFA" />
        </div>
      </div>

      {/* Latest thought — only when populated from real events */}
      <AnimatePresence mode="popLayout">
        {agent.thoughts[0] && (
          <motion.div
            key={agent.thoughts[0].id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mx-3 mb-2 rounded-md px-2.5 py-1.5 border border-[rgba(59,130,246,0.12)]"
            style={{ background: "rgba(59,130,246,0.04)" }}
          >
            <p className="text-[9.5px] text-[#94A3B8] leading-relaxed line-clamp-2 font-mono">
              {agent.thoughts[0].text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 pb-2.5">
        <span className="text-[9px] text-[#64748B] tabular-nums">{agent.eventCount} events</span>
        <div className="flex gap-1">
          {agent.toolsUsed.slice(0, 2).map(t => (
            <span
              key={t}
              className="text-[8px] px-1.5 py-0.5 rounded font-mono text-[#64748B]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── System health ──────────────────────────────────────────────────────────

function SystemHealthBar() {
  const systemHealth = useAgentStore(s => s.systemHealth)
  const agents       = useAgentStore(s => s.agents)
  const activeCount  = agents.filter(a => a.status !== "idle" && a.status !== "waiting").length

  return (
    <div
      className="rounded-lg px-3 py-2.5 mb-2 border border-[rgba(255,255,255,0.07)]"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9.5px] font-semibold text-[#94A3B8] tracking-wide uppercase">System</span>
        <span className="text-[11px] font-semibold text-[#4ADE80] tabular-nums">
          {Math.round(systemHealth * 100)}%
        </span>
      </div>
      <Bar value={systemHealth} color="#22C55E" />
      <div className="flex gap-4 mt-2">
        <div>
          <p className="text-[9px] text-[#64748B]">Active</p>
          <p className="text-[10px] font-semibold text-[#CBD5E1] tabular-nums">{activeCount}/6</p>
        </div>
        <div>
          <p className="text-[9px] text-[#64748B]">Throughput</p>
          <p className="text-[10px] font-semibold text-[#CBD5E1] tabular-nums">
            {useAgentStore.getState().throughput}/min
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Agent Network panel ────────────────────────────────────────────────────

export default function AgentNetwork() {
  const agents        = useAgentStore(s => s.agents)
  const selectedAgent = useAgentStore(s => s.selectedAgent)
  const setSelected   = useAgentStore(s => s.setSelectedAgent)
  const activeCount   = agents.filter(a => a.status !== "idle" && a.status !== "waiting").length

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "var(--surface-base)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.07)] shrink-0">
        <div>
          {/* Panel title — clearly readable */}
          <p className="text-[11px] font-semibold text-[#CBD5E1] tracking-tight">Agent Network</p>
          <p className="text-[9px] text-[#64748B] font-mono mt-0.5">Multi-agent mesh</p>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          <span className="size-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
          <span className="text-[9.5px] font-semibold text-[#4ADE80]">{activeCount} active</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5">
        <SystemHealthBar />
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedAgent === agent.id}
            onClick={() => setSelected(selectedAgent === agent.id ? null : agent.id)}
          />
        ))}
      </div>
    </div>
  )
}
