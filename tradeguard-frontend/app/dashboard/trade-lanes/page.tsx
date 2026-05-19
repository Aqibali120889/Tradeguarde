"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLiveStream } from "@/hooks/use-live-stream"
import { useLiveStore } from "@/stores/live-store"
import {
  Activity, Globe, ChevronRight, X, Maximize2,
  BarChart2, Zap
} from "lucide-react"
import type { TradeRoute } from "@/components/globe/tactical-globe"
import { SEVERITY_COLOR, SEVERITY_LABEL } from "@/components/globe/tactical-globe"

// ─── Dynamic imports (no SSR) ──────────────────────────────────────────────

const TacticalGlobe = dynamic(
  () => import("@/components/globe/tactical-globe"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#030810]">
        <div className="relative mb-5">
          <span className="size-16 rounded-full border border-[#00C2FF]/20 animate-ping absolute inset-0 block" />
          <span className="size-16 rounded-full border-2 border-t-[#00C2FF]/80 border-[#00C2FF]/10 animate-spin block" />
        </div>
        <p className="font-mono text-xs tracking-[0.3em] text-[#00C2FF]/60 uppercase">Loading Globe…</p>
      </div>
    ),
  }
)

const OpsSidebar = dynamic(
  () => import("@/components/trade-lanes/ops-sidebar"),
  { ssr: false }
)

// ─── Route detail panel ────────────────────────────────────────────────────

function RouteDetailPanel({ route, onClose }: { route: TradeRoute; onClose: () => void }) {
  const color = SEVERITY_COLOR[route.severity]

  return (
    <motion.div
      key={route.id}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute bottom-6 right-6 z-30 w-80 rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: "rgba(6,12,26,0.92)",
        backdropFilter: "blur(20px)",
        border: `1px solid ${color}30`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${color}20` }}>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-white/90">
            Route Intelligence
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white/70 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-[13px] font-bold text-white">{route.label}</p>
          <div
            className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-bold"
            style={{ background: `${color}20`, color }}
          >
            <span className="size-1 rounded-full" style={{ background: color }} />
            {SEVERITY_LABEL[route.severity]}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "TRADE VALUE", value: route.value },
            { label: "TEU VOLUME", value: route.volume },
            { label: "ORIGIN", value: route.origin },
            { label: "DESTINATION", value: route.destination },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg p-2.5"
              style={{ background: "rgba(0,194,255,0.04)", border: "1px solid rgba(0,194,255,0.08)" }}
            >
            <div className="text-[8px] font-mono tracking-wider text-[#64748B] mb-1">{item.label}</div>
              <div className="text-[11px] font-mono text-[#CBD5E1]">{item.value}</div>
            </div>
          ))}
        </div>

        {route.reason && (
          <div
            className="rounded-lg p-2.5"
            style={{ background: "rgba(255,176,32,0.08)", border: "1px solid rgba(255,176,32,0.2)" }}
          >
            <div className="text-[8px] font-mono tracking-widest text-[#FFB020]/70 mb-1">⚠ DISRUPTION REASON</div>
            <p className="text-[10px] text-[#FFB020]/90 leading-snug">{route.reason}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            className="flex-1 rounded-lg py-2 text-[10px] font-mono font-bold tracking-wider transition-all"
            style={{
              background: "rgba(0,194,255,0.12)",
              border: "1px solid rgba(0,194,255,0.25)",
              color: "#00C2FF",
            }}
          >
            ANALYZE
          </button>
          <button
            className="flex-1 rounded-lg py-2 text-[10px] font-mono font-bold tracking-wider transition-all"
            style={{
              background: "rgba(167,139,250,0.12)",
              border: "1px solid rgba(167,139,250,0.25)",
              color: "#A78BFA",
            }}
          >
            REROUTE
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Status bar ────────────────────────────────────────────────────────────

function StatusBar() {
  const { connected, reconnecting } = useLiveStream()
  const kpi = useLiveStore((s) => s.kpi)

  const stats = [
    { label: "LANES", value: "1,204" },
    { label: "ACTIVE RISKS", value: kpi.active_risks },
    { label: "SHIPMENTS", value: kpi.affected_shipments },
    { label: "COMPLIANCE", value: `${kpi.compliance_score.toFixed(1)}%` },
    { label: "AI ACTIONS", value: kpi.autonomous_actions.toLocaleString() },
  ]

  return (
    <div
      className="absolute top-0 left-0 right-0 z-20 flex items-center px-5 h-11"
      style={{
        background: "rgba(4,10,22,0.80)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,194,255,0.08)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 mr-6">
        <Globe size={14} className="text-[#00C2FF]" />
        <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-[#00C2FF]">
          Trade Lanes
        </span>
        <ChevronRight size={11} className="text-white/20" />
        <span className="text-[10px] font-mono text-white/40 tracking-wider">Global Intelligence</span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            {/* Stat label — readable secondary */}
            <span className="text-[8px] font-mono text-[#64748B] tracking-wider">{s.label}</span>
            <span className="text-[11px] font-mono font-semibold text-[#CBD5E1] tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Right — connection status */}
      <div className="ml-auto flex items-center gap-3">
        {reconnecting && (
          <span className="text-[9px] font-mono text-[#FFB020] tracking-wider animate-pulse">
            RECONNECTING…
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full block ${connected ? "bg-[#3DD598] animate-pulse" : "bg-[#FF4D6D]"}`}
          />
          <span
            className="text-[9px] font-mono font-bold tracking-wider"
            style={{ color: connected ? "#3DD598" : "#FF4D6D" }}
          >
            {connected ? "LIVE" : "STANDBY"}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Legend ────────────────────────────────────────────────────────────────

function TacticalLegend() {
  const items = [
    { color: "#00C2FF", label: "Nominal Route" },
    { color: "#FFB020", label: "Disruption" },
    { color: "#FF4D6D", label: "Critical / Sanctions" },
    { color: "#A78BFA", label: "Rerouted" },
    { color: "rgba(255,77,109,0.5)", label: "Restricted Zone", bordered: true },
  ]

  return (
    <motion.div
      className="absolute bottom-6 left-6 z-20 rounded-xl p-3 space-y-2"
      style={{
        background: "rgba(4,10,22,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0,194,255,0.1)",
      }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1.5, duration: 0.5 }}
    >
      <p className="text-[8px] font-mono tracking-[0.2em] text-[#64748B] uppercase mb-2">Route Legend</p>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          {item.bordered ? (
            <span
              className="size-3 rounded-sm border"
              style={{ background: item.color, borderColor: "#F87171" }}
            />
          ) : (
            <span className="size-2 rounded-full" style={{ background: item.color }} />
          )}
          {/* Legend labels — clearly readable */}
          <span className="text-[9.5px] text-[#94A3B8] font-mono">{item.label}</span>
        </div>
      ))}
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function TradeLanesPage() {
  const [selectedRoute, setSelectedRoute] = useState<TradeRoute | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex w-full flex-1 overflow-hidden bg-[#030810]">

      {/* ── Left operational sidebar ──────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!sidebarCollapsed && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="shrink-0 overflow-hidden relative z-10 h-full"
            style={{ paddingTop: 44 }} // below status bar
          >
            <OpsSidebar />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sidebar toggle ────────────────────────────────────────────── */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        className="absolute left-0 z-30 flex items-center justify-center transition-all"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          left: sidebarCollapsed ? 0 : 320,
          background: "rgba(0,194,255,0.1)",
          border: "1px solid rgba(0,194,255,0.15)",
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          width: 20,
          height: 48,
        }}
        aria-label="Toggle sidebar"
      >
        <ChevronRight
          size={12}
          className="text-[#00C2FF]/60"
          style={{ transform: sidebarCollapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.3s" }}
        />
      </button>

      {/* ── Main globe area ───────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top status bar */}
        <StatusBar />

        {/* Globe — fills remaining space below status bar */}
        <div className="absolute inset-0 top-11">
          <TacticalGlobe
            onRouteClick={setSelectedRoute}
            onRouteHover={() => {}}
          />
        </div>

        {/* Tactical legend */}
        <TacticalLegend />

        {/* Route detail panel */}
        <AnimatePresence>
          {selectedRoute && (
            <RouteDetailPanel
              route={selectedRoute}
              onClose={() => setSelectedRoute(null)}
            />
          )}
        </AnimatePresence>

        {/* Watermark */}
        <div className="absolute top-14 right-5 z-10 text-right pointer-events-none">
          <p className="text-[8px] font-mono tracking-[0.3em] text-white/10 uppercase">
            TradeGuard v0.1 — Autonomous Intelligence
          </p>
        </div>
      </div>
    </div>
  )
}
