"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Database, Shield, Zap, GitBranch, Clock } from "lucide-react"
import { useTradeIntelligenceStore } from "@/stores/trade-intelligence-store"
import type { LiveEvent } from "@/stores/live-store"

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#FF4D6D",
  warning:  "#FFB020",
  info:     "#00C2FF",
  success:  "#10B981",
}

const SOURCE_LABELS: Record<string, string> = {
  wto:            "WTO API",
  opensanctions:  "OpenSanctions DB",
  gta:            "Global Trade Alert",
  customs:        "Customs Data API",
  watchdog:       "Watchdog Agent",
  impact_analyzer:"Impact Analyzer Agent",
  planner:        "Route Planner Agent",
  execution:      "Execution Agent",
  governance:     "Governance Agent",
  system:         "System",
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[#00C2FF]/70">{icon}</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">{label}</span>
        <div className="flex-1 h-px bg-white/6" />
      </div>
      <div>{children}</div>
    </div>
  )
}

function CodeBlock({ data }: { data: unknown }) {
  return (
    <pre
      className="text-[9px] font-mono text-[#00C2FF]/80 leading-relaxed overflow-x-auto p-3 rounded"
      style={{ background: "rgba(0,194,255,0.04)", border: "1px solid rgba(0,194,255,0.10)" }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

function ReasoningStep({ step, index }: { step: string; index: number }) {
  const colors = ["#00C2FF", "#10B981", "#FFB020", "#A78BFA", "#FF4D6D"]
  const color = colors[index % colors.length]
  return (
    <div className="flex gap-2 text-[10px] font-mono">
      <span style={{ color }} className="flex-shrink-0 font-bold">{index + 1}.</span>
      <span className="text-white/65 leading-snug">{step}</span>
    </div>
  )
}

export function SourceInspectionModal() {
  const event = useTradeIntelligenceStore((s) => s.selectedSourceEvent)
  const clear  = useTradeIntelligenceStore((s) => s.setSelectedSourceEvent)

  if (!event) return null

  const color = SEVERITY_COLOR[event.severity] ?? "#00C2FF"
  const source = SOURCE_LABELS[event.agent] ?? event.agent

  // Build reasoning chain from event data
  const reasoningChain: string[] = []
  if (event.payload?.origin && event.payload?.destination) {
    reasoningChain.push(`Detected change on route: ${event.payload.origin} → ${event.payload.destination}`)
  }
  if (event.severity === "critical" || event.severity === "warning") {
    reasoningChain.push(`Risk level elevated to ${event.severity.toUpperCase()} — triggering compliance check`)
  }
  if (event.payload?.affected_shipments) {
    reasoningChain.push(`${event.payload.affected_shipments} shipments identified in affected corridors`)
  }
  if (event.payload?.affected_hs_codes?.length) {
    reasoningChain.push(`HS codes in scope: ${(event.payload.affected_hs_codes as string[]).join(", ")}`)
  }
  reasoningChain.push(`Agent [${event.agent}] processed event at confidence ${((event.confidence_score ?? 1) * 100).toFixed(0)}%`)
  reasoningChain.push("Emitting globe update → reroute / sanctions overlay / shockwave propagation")

  return (
    <AnimatePresence>
      <motion.div
        key="source-modal-backdrop"
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => clear(null)}
      >
        <motion.div
          key="source-modal"
          className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl"
          style={{
            background: "rgba(4,10,22,0.97)",
            border: `1px solid ${color}30`,
            boxShadow: `0 0 60px ${color}18`,
          }}
          initial={{ scale: 0.94, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, y: 20, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-start gap-3 p-4 border-b"
            style={{ borderColor: `${color}20` }}
          >
            <div
              className="size-2 rounded-full mt-1.5 animate-pulse flex-shrink-0"
              style={{ background: color }}
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-mono font-bold text-white/90 mb-0.5">{event.title}</h2>
              <p className="text-[10px] font-mono text-white/45">{event.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded"
                style={{ background: `${color}18`, color }}
              >
                {event.severity}
              </span>
              <button
                onClick={() => clear(null)}
                className="text-white/30 hover:text-white/70 transition-colors p-1 rounded"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-5">
            {/* Meta */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Source", value: source },
                { label: "Agent", value: event.agent },
                { label: "Confidence", value: `${((event.confidence_score ?? 1) * 100).toFixed(0)}%` },
                { label: "Topic", value: event.topic || "—" },
                { label: "Event ID", value: event.id.slice(0, 16) + "…" },
                { label: "Timestamp", value: new Date(event.timestamp).toLocaleString() },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded p-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-[9px] font-mono text-white/35 uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-[10px] font-mono text-white/80 truncate">{value}</p>
                </div>
              ))}
            </div>

            {/* Raw Payload */}
            <Section icon={<Database size={12} />} label="Raw API Payload">
              <CodeBlock data={event.payload} />
            </Section>

            {/* Affected Entities */}
            {event.affected_entities?.length > 0 && (
              <Section icon={<Zap size={12} />} label="Affected Entities">
                <div className="flex flex-wrap gap-1.5">
                  {event.affected_entities.map((e) => (
                    <span
                      key={e}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                      style={{ background: `${color}14`, color, border: `1px solid ${color}28` }}
                    >
                      {e}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Reasoning Chain */}
            <Section icon={<GitBranch size={12} />} label="Agent Reasoning Chain">
              <div className="space-y-1.5 pl-2">
                {reasoningChain.map((step, i) => (
                  <ReasoningStep key={i} step={step} index={i} />
                ))}
              </div>
            </Section>

            {/* Full Event */}
            <Section icon={<Shield size={12} />} label="Complete Event Record">
              <CodeBlock data={{ id: event.id, topic: event.topic, agent: event.agent, severity: event.severity, timestamp: event.timestamp, confidence_score: event.confidence_score }} />
            </Section>

            {/* Fetch Info */}
            <Section icon={<Clock size={12} />} label="Data Lineage">
              <div
                className="text-[9px] font-mono text-white/45 p-3 rounded space-y-1"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <p>Stream: <span className="text-[#00C2FF]/70">SSE /api/stream/events</span></p>
                <p>Ingested: <span className="text-white/60">{new Date(event.timestamp).toISOString()}</span></p>
                <p>Processed by: <span className="text-[#10B981]/70">GlobeEventProcessor → useTradeIntelligenceStore</span></p>
                <p>Globe reaction: <span className="text-[#A78BFA]/70">Entity update + shockwave propagation</span></p>
              </div>
            </Section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
