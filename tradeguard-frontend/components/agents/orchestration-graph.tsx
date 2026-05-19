"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore, type AgentId, type AgentStatus } from "@/stores/agent-store"

// ─── Node positions (fixed layout — vertical pipeline + branch) ────────────

const NODE_POS: Record<AgentId, { x: number; y: number }> = {
  watchdog:      { x: 400, y: 80  },
  impact:        { x: 400, y: 220 },
  planner:       { x: 400, y: 360 },
  execution:     { x: 400, y: 500 },
  governance:    { x: 220, y: 620 },
  communication: { x: 580, y: 620 },
}

// Enterprise palette — balanced saturation, readable on dark
const STATUS_COLOR: Record<AgentStatus, string> = {
  monitoring:    "#60A5FA",
  reasoning:     "#A78BFA",
  executing:     "#4ADE80",
  escalating:    "#F87171",
  waiting:       "#64748B",
  resolving:     "#FBBF24",
  communicating: "#22D3EE",
  idle:          "#334155",
}

const SEV_COLOR: Record<string, string> = {
  info:     "#60A5FA",
  warning:  "#FBBF24",
  critical: "#F87171",
  success:  "#4ADE80",
}

// ─── Animated edge ─────────────────────────────────────────────────────────

interface EdgeProps {
  from: { x: number; y: number }
  to:   { x: number; y: number }
  active: boolean
  severity: string
  pulseTs: number
}

function AnimatedEdge({ from, to, active, severity, pulseTs }: EdgeProps) {
  const color = SEV_COLOR[severity] ?? "#00C2FF"

  // Control point for slight curve
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2 - 20

  const pathD = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
  const gradId = `edge-grad-${from.x}-${to.x}-${from.y}-${to.y}`

  return (
    <g>
      {/* Base line */}
      <path
        d={pathD}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1.5}
        fill="none"
        strokeDasharray="4 6"
      />

      {/* Active glow */}
      {active && (
        <path
          d={pathD}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          opacity={0.7}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}

      {/* Animated data packet */}
      {active && (
        <circle r={4} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
          <animateMotion
            dur="1.2s"
            repeatCount="indefinite"
            path={pathD}
          />
        </circle>
      )}
    </g>
  )
}

// ─── Agent node ────────────────────────────────────────────────────────────

interface NodeProps {
  agent: ReturnType<typeof useAgentStore.getState>["agents"][0]
  pos: { x: number; y: number }
  selected: boolean
  onClick: () => void
}

function AgentNode({ agent, pos, selected, onClick }: NodeProps) {
  const color = STATUS_COLOR[agent.status]
  const r = 44

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Outer pulse ring — visible when active */}
      {agent.active && (
        <circle
          r={r + 14}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.25}
          style={{ animation: "pulse-ring 1.8s ease-out infinite" }}
        />
      )}

      {/* Selection ring */}
      {selected && (
        <circle
          r={r + 8}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}

      {/* Node glow */}
      <circle
        r={r + 4}
        fill={color}
        opacity={agent.active ? 0.08 : 0.03}
        style={agent.active ? { filter: `blur(8px)` } : {}}
      />

      {/* Main circle */}
      <circle
        r={r}
        fill="#101A2C"
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.5}
        opacity={1}
        style={{ filter: agent.active ? `drop-shadow(0 0 10px ${color}55)` : "none" }}
      />

      {/* Icon */}
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={22}
        y={-6}
      >
        {agent.icon}
      </text>

      {/* Status dot */}
      <circle
        cx={r - 4}
        cy={-(r - 4)}
        r={5}
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />

      {/* Name label below */}
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        y={14}
        fill="rgba(255,255,255,0.85)"
        fontFamily="'Inter', 'Courier New', monospace"
        fontWeight="600"
      >
        {agent.name.toUpperCase().slice(0, 12)}
      </text>

      {/* Status badge */}
      <g transform={`translate(0, 58)`}>
        <rect
          x={-32}
          y={-9}
          width={64}
          height={16}
          rx={4}
          fill={`${color}22`}
          stroke={`${color}55`}
          strokeWidth={0.5}
        />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={7}
          fill={color}
          fontFamily="'Courier New', monospace"
          fontWeight="bold"
          letterSpacing={1}
        >
          {agent.status.toUpperCase().slice(0, 11)}
        </text>
      </g>

      {/* Confidence arc */}
      <path
        d={describeArc(0, 0, r + 2, -90, -90 + 180 * agent.confidence)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        opacity={0.35}
        strokeLinecap="round"
      />
    </g>
  )
}

function describeArc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
  const start = polar(x, y, r, endAngle)
  const end   = polar(x, y, r, startAngle)
  const large = endAngle - startAngle <= 180 ? "0" : "1"
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
}
function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ─── Orchestration Graph ───────────────────────────────────────────────────

export default function OrchestrationGraph() {
  const agents        = useAgentStore(s => s.agents)
  const edges         = useAgentStore(s => s.edges)
  const selectedAgent = useAgentStore(s => s.selectedAgent)
  const setSelected   = useAgentStore(s => s.setSelectedAgent)
  const workflows     = useAgentStore(s => s.workflows)

  const W = 800
  const H = 740

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid rgba(0,194,255,0.07)" }}
      >
        <div>
          <span className="text-[11px] font-semibold tracking-wide text-[#E2E8F0]">
            Agent Orchestration
          </span>
          {/* Subtitle — readable muted text */}
          <p className="text-[9px] font-mono text-[#64748B] mt-0.5">Live multi-agent workflow graph</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          {(["executing", "reasoning", "escalating"] as AgentStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {/* Legend label — clearly readable */}
              <span className="text-[8px] font-mono text-[#94A3B8]">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Graph */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full max-w-full"
          style={{ maxHeight: "100%" }}
        >
          <defs>
            <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00C2FF" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#081120" stopOpacity="0" />
            </radialGradient>
            <style>{`
              @keyframes pulse-ring {
                0%   { r: 58; opacity: 0.3; }
                100% { r: 80; opacity: 0; }
              }
            `}</style>
          </defs>

          {/* Background glow */}
          <ellipse cx={W / 2} cy={H / 2} rx={320} ry={280} fill="url(#bg-glow)" />

          {/* Grid — very subtle for operational feel */}
          {Array.from({ length: 16 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 53} y1={0} x2={i * 53} y2={H} stroke="rgba(255,255,255,0.025)" strokeWidth={0.5} />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 53} x2={W} y2={i * 53} stroke="rgba(255,255,255,0.025)" strokeWidth={0.5} />
          ))}

          {/* Edges */}
          {edges.map((edge, i) => {
            const from = NODE_POS[edge.from]
            const to   = NODE_POS[edge.to]
            const fy   = from.y + 44  // bottom of node
            const ty   = to.y - 44   // top of next node
            return (
              <AnimatedEdge
                key={i}
                from={{ x: from.x, y: fy }}
                to={{ x: to.x, y: ty }}
                active={edge.active}
                severity={edge.severity}
                pulseTs={edge.pulseTs}
              />
            )
          })}

          {/* Nodes */}
          {agents.map(agent => (
            <AgentNode
              key={agent.id}
              agent={agent}
              pos={NODE_POS[agent.id]}
              selected={selectedAgent === agent.id}
              onClick={() => setSelected(selectedAgent === agent.id ? null : agent.id)}
            />
          ))}

          {/* Watermark */}
          <text x={W - 12} y={H - 10} textAnchor="end" fontSize={8} fill="rgba(0,194,255,0.12)" fontFamily="monospace">
            TRADEGUARD AGENT MESH v2.4
          </text>
        </svg>

        {/* Floating active workflow indicator */}
        <AnimatePresence>
          {agents.some(a => a.status === "executing") && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.28)" }}
            >
              <span className="size-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
              <span className="text-[10px] font-semibold text-[#4ADE80] tracking-wide">
                Autonomous Execution In Progress
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
