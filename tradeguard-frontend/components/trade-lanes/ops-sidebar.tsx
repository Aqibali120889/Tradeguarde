"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLiveStore } from "@/stores/live-store"
import {
  AlertTriangle, Activity, Zap, Shield, Radio,
  TrendingUp, TrendingDown, RotateCcw, Eye
} from "lucide-react"

// ─── Color helpers ─────────────────────────────────────────────────────────

// Enterprise-grade color palette — readable on dark surfaces
const SEV_COLOR: Record<string, string> = {
  critical: "#F87171",
  warning:  "#FBBF24",
  success:  "#4ADE80",
  info:     "#60A5FA",
}

const SEV_BG: Record<string, string> = {
  critical: "rgba(239,68,68,0.09)",
  warning:  "rgba(245,158,11,0.09)",
  success:  "rgba(34,197,94,0.09)",
  info:     "rgba(59,130,246,0.09)",
}

// ─── Seed operational feed ─────────────────────────────────────────────────

const SEED_FEED = [
  { id: "s1", agent: "Watchdog Agent",    msg: "Detected tariff escalation on Trans-Pacific corridor",   sev: "critical", ts: "00:14" },
  { id: "s2", agent: "Impact Analyzer",   msg: "Recalculated exposure: $2.1B at risk across 8 routes",   sev: "warning",  ts: "00:42" },
  { id: "s3", agent: "Planner Agent",     msg: "Rerouted TG-482 via Cape of Good Hope — compliant",      sev: "success",  ts: "01:07" },
  { id: "s4", agent: "Execution Agent",   msg: "Validated compliance for Singapore → Hamburg (TG-391)",   sev: "info",     ts: "01:33" },
  { id: "s5", agent: "Governance Agent",  msg: "Approved autonomous reroute workflow — 3 shipments",      sev: "success",  ts: "02:01" },
  { id: "s6", agent: "Watchdog Agent",    msg: "OFAC update: 14 new entities added to blocked list",      sev: "critical", ts: "03:22" },
  { id: "s7", agent: "Sanctions Agent",   msg: "Screening 142 active shipments against updated list",     sev: "warning",  ts: "04:05" },
  { id: "s8", agent: "Planner Agent",     msg: "Identified 3 alternative routes for Dubai exposure",      sev: "info",     ts: "05:14" },
]

const DISRUPTIONS = [
  { id: "d1", label: "Suez Canal Congestion",      region: "Red Sea",       sev: "critical", ships: 14, delay: "+3.2d" },
  { id: "d2", label: "Singapore Strait Warning",   region: "Malacca Strait",sev: "warning",  ships: 6,  delay: "+0.8d" },
  { id: "d3", label: "Black Sea Route Restricted", region: "Black Sea",     sev: "critical", ships: 0,  delay: "Closed" },
]

const SANCTIONS = [
  { id: "k1", label: "Persian Gulf OFAC Zone",    entities: 14, exposure: "$670M" },
  { id: "k2", label: "Russia (OFAC/EU Sanctions)", entities: 38, exposure: "$1.2B" },
]

const REROUTES = [
  {
    id: "rr1",
    from: "Dubai → New York",
    to: "Dubai → Rotterdam (via Suez alt.)",
    delta: "+$34K",
    status: "pending",
    shipments: 3,
  },
  {
    id: "rr2",
    from: "Shanghai → Rotterdam",
    to: "Shanghai → Rotterdam (Cape route)",
    delta: "+$89K",
    status: "approved",
    shipments: 7,
  },
]

// ─── Feed item ────────────────────────────────────────────────────────────

interface FeedItem {
  id: string
  agent: string
  msg: string
  sev: string
  ts: string
}

function FeedEntry({ item, isNew }: { item: FeedItem; isNew?: boolean }) {
  return (
    <motion.div
      key={item.id}
      layout
      initial={isNew ? { opacity: 0, x: -12, height: 0 } : false}
      animate={{ opacity: 1, x: 0, height: "auto" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex items-start gap-2.5 py-2 border-b border-white/5 last:border-0"
    >
      <div className="shrink-0 mt-0.5">
        <span
          className="size-1.5 rounded-full block mt-1"
          style={{ background: SEV_COLOR[item.sev] ?? "#00C2FF", boxShadow: `0 0 6px ${SEV_COLOR[item.sev]}80` }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[9px] font-mono font-semibold tracking-wide uppercase" style={{ color: SEV_COLOR[item.sev] }}>
            {item.agent}
          </span>
          {/* Timestamp — readable secondary text */}
          <span className="text-[9px] font-mono text-[#64748B] shrink-0 tabular-nums">{item.ts}m</span>
        </div>
        {/* Message — clearly readable primary content */}
        <p className="text-[10.5px] text-[#CBD5E1] leading-snug">{item.msg}</p>
      </div>
    </motion.div>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count, color = "#00C2FF" }: {
  icon: React.ElementType; label: string; count?: number; color?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} style={{ color }} />
      <span className="text-[11px] font-bold font-mono tracking-widest uppercase text-white/80">{label}</span>
      {count !== undefined && (
        <span
          className="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${color}20`, color }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// ─── KPI strip ────────────────────────────────────────────────────────────

function KpiStrip() {
  const kpi = useLiveStore((s) => s.kpi)
  const connected = useLiveStore((s) => s.connected)

  const items = [
    { label: "COMPLIANCE", value: `${kpi.compliance_score.toFixed(1)}%`, trend: kpi.compliance_trend, up: true },
    { label: "ACTIVE RISKS", value: kpi.active_risks, trend: kpi.risks_trend, up: false },
    { label: "SHIPMENTS", value: kpi.affected_shipments, trend: kpi.shipments_trend, up: false },
    { label: "AUTO-ACTIONS", value: kpi.autonomous_actions.toLocaleString(), trend: kpi.actions_trend, up: true },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {items.map((item) => {
        const isPositive = item.trend > 0
        const color = (isPositive === item.up) ? "#3DD598" : "#FF4D6D"
        return (
          <div
            key={item.label}
            className="rounded-lg p-2.5"
            style={{ background: "rgba(0,194,255,0.04)", border: "1px solid rgba(0,194,255,0.08)" }}
          >
            <div className="text-[8.5px] font-mono tracking-wider text-[#64748B] mb-1">{item.label}</div>
            <div className="text-[15px] font-bold text-[#F1F5F9] font-mono tabular-nums">{item.value}</div>
            <div className="flex items-center gap-1 mt-0.5">
              {isPositive
                ? <TrendingUp size={8} style={{ color }} />
                : <TrendingDown size={8} style={{ color }} />}
              <span className="text-[8px] font-mono" style={{ color }}>
                {item.trend > 0 ? "+" : ""}{item.trend}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────

export default function OpsSidebar() {
  const liveEvents = useLiveStore((s) => s.agentActivity)
  const connected  = useLiveStore((s) => s.connected)

  // Merge seeded + live events, keep latest 20
  const [feed, setFeed] = useState<FeedItem[]>(SEED_FEED)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(0)

  useEffect(() => {
    if (liveEvents.length <= prevLen.current) return
    const newest = liveEvents[0]
    const item: FeedItem = {
      id: newest.id,
      agent: newest.agent || "Agent",
      msg: newest.title,
      sev: newest.severity,
      ts: new Date(newest.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    }
    setFeed((prev) => [item, ...prev].slice(0, 24))
    setNewIds((prev) => new Set([...prev, newest.id]))
    setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(newest.id); return n }), 2000)
    prevLen.current = liveEvents.length

    // Auto-scroll
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [liveEvents])

  // Simulate autonomous feed ticks when not connected to backend
  useEffect(() => {
    if (connected) return
    const AGENTS = ["Watchdog Agent", "Impact Analyzer", "Planner Agent", "Execution Agent", "Sanctions Agent"]
    const MSGS = [
      "Scanning 1,204 global trade lanes — nominal",
      "Geopolitical risk model updated: +2 hotspots",
      "Port congestion detected: Singapore ETA +6h",
      "Cross-referencing OFAC list — 0 matches found",
      "Autonomous compliance check completed: TG-519",
      "Tariff volatility index elevated in APAC corridor",
      "Rerouting recommendation queued for review",
    ]
    const SEVS = ["info", "info", "info", "warning", "success"] as const

    let idx = 0
    const timer = setInterval(() => {
      const sev = SEVS[Math.floor(Math.random() * SEVS.length)]
      const item: FeedItem = {
        id: `sim-${Date.now()}-${idx++}`,
        agent: AGENTS[Math.floor(Math.random() * AGENTS.length)],
        msg: MSGS[Math.floor(Math.random() * MSGS.length)],
        sev,
        ts: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      }
      setFeed((prev) => [item, ...prev].slice(0, 24))
      setNewIds((prev) => new Set([...prev, item.id]))
      setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(item.id); return n }), 2000)
    }, 4500)

    return () => clearInterval(timer)
  }, [connected])

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        background: "rgba(10,15,28,0.95)",
        backdropFilter: "blur(16px)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="relative">
            <span className="size-2 rounded-full bg-[#00C2FF] block" />
            <span className="size-2 rounded-full bg-[#00C2FF] block absolute inset-0 animate-ping opacity-60" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#E2E8F0]">
            Operations Center
          </span>
          <span
            className="ml-auto text-[8px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: connected ? "rgba(61,213,152,0.15)" : "rgba(255,77,109,0.15)",
              color: connected ? "#3DD598" : "#FF4D6D",
              border: `1px solid ${connected ? "rgba(61,213,152,0.3)" : "rgba(255,77,109,0.3)"}`,
            }}
          >
            {connected ? "LIVE" : "STANDBY"}
          </span>
        </div>
        <p className="text-[9px] font-mono text-[#475569] tracking-wider">
          TradeGuard Autonomous Intelligence
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-thin">

        {/* KPI Strip */}
        <KpiStrip />

        {/* Active Disruptions */}
        <div>
          <SectionHeader icon={AlertTriangle} label="Disruptions" count={DISRUPTIONS.length} color="#FFB020" />
          <div className="space-y-2">
            {DISRUPTIONS.map((d) => (
              <motion.div
                key={d.id}
                className="rounded-lg p-2.5"
                style={{
                  background: SEV_BG[d.sev],
                  border: `1px solid ${SEV_COLOR[d.sev]}30`,
                }}
                whileHover={{ scale: 1.01 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center justify-between mb-1">
                  {/* Label — clearly readable */}
                  <span className="text-[10px] font-semibold text-[#E2E8F0]">{d.label}</span>
                  <span className="text-[8px] font-mono font-semibold" style={{ color: SEV_COLOR[d.sev] }}>
                    {d.sev.toUpperCase()}
                  </span>
                </div>
                {/* Metadata — readable secondary */}
                <div className="flex gap-3 text-[9px] font-mono text-[#64748B]">
                  <span>{d.region}</span>
                  <span className="ml-auto">{d.ships > 0 ? `${d.ships} ships` : "Closed"}</span>
                  <span style={{ color: SEV_COLOR[d.sev] }}>{d.delay}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Sanctions Zones */}
        <div>
          <SectionHeader icon={Shield} label="Sanctions Zones" count={SANCTIONS.length} color="#FF4D6D" />
          <div className="space-y-2">
            {SANCTIONS.map((s) => (
              <div
                key={s.id}
                className="rounded-lg p-2.5"
                style={{ background: "rgba(255,77,109,0.07)", border: "1px solid rgba(255,77,109,0.2)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-[#E2E8F0]">{s.label}</span>
                  <Eye size={10} className="text-[#F87171]/70" />
                </div>
                <div className="flex gap-3 text-[9px] font-mono text-[#64748B]">
                  <span>{s.entities} entities</span>
                  <span className="ml-auto text-[#F87171]"> {s.exposure} exposure</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Autonomous Reroutes */}
        <div>
          <SectionHeader icon={RotateCcw} label="Autonomous Reroutes" count={REROUTES.length} color="#A78BFA" />
          <div className="space-y-2">
            {REROUTES.map((r) => (
              <motion.div
                key={r.id}
                className="rounded-lg p-2.5"
                style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)" }}
                whileHover={{ scale: 1.01 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: r.status === "approved" ? "rgba(61,213,152,0.15)" : "rgba(255,176,32,0.15)",
                      color: r.status === "approved" ? "#3DD598" : "#FFB020",
                    }}
                  >
                    {r.status.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono text-white/40">{r.shipments} ships</span>
                </div>
                {/* Strikethrough old route — readable even when muted */}
                <p className="text-[9px] font-mono text-[#64748B] line-through mb-0.5">{r.from}</p>
                <p className="text-[10px] text-[#CBD5E1]">{r.to}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[9px] font-mono text-[#64748B]">Cost delta</span>
                  <span className="text-[9px] font-mono text-[#FBBF24]">{r.delta}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Agent Activity Feed */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={13} className="text-[#60A5FA]" />
            <span className="text-[11px] font-semibold tracking-wide text-[#E2E8F0]">
              Agent Feed
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#3DD598] animate-pulse block" />
              <span className="text-[8px] font-mono text-[#3DD598] tracking-widest">LIVE</span>
            </div>
          </div>
          <div
            ref={feedRef}
            className="max-h-[320px] overflow-y-auto pr-1"
          >
            <AnimatePresence initial={false}>
              {feed.map((item) => (
                <FeedEntry key={item.id} item={item} isNew={newIds.has(item.id)} />
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>

      {/* Footer status bar */}
      <div
        className="px-4 py-2.5 shrink-0 flex items-center gap-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <Activity size={10} className="text-[#60A5FA]/70" />
        {/* Footer text — readable secondary */}
        <span className="text-[9px] font-mono text-[#64748B] tracking-wider">
          1,204 LANES MONITORED
        </span>
        <span className="ml-auto text-[9px] font-mono text-[#475569] tabular-nums">
          {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </div>
  )
}
