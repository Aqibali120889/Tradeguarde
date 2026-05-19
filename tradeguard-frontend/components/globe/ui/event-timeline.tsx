"use client"

import React, { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLiveStore, type LiveEvent } from "@/stores/live-store"
import { useTradeIntelligenceStore } from "@/stores/trade-intelligence-store"

const SEVERITY_DOT: Record<string, string> = {
  critical: "#FF4D6D",
  warning:  "#FFB020",
  info:     "#00C2FF",
  success:  "#10B981",
}

const AGENT_ICONS: Record<string, string> = {
  watchdog:       "👁",
  impact_analyzer:"⚡",
  planner:        "🗺",
  execution:      "🚀",
  governance:     "🛡",
  system:         "⚙",
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return ts.slice(11, 19) ?? "--:--:--"
  }
}

function EventRow({ event, onClick }: { event: LiveEvent; onClick: (e: LiveEvent) => void }) {
  const color = SEVERITY_DOT[event.severity] ?? "#00C2FF"
  const icon  = AGENT_ICONS[event.agent] ?? "⚙"

  return (
    <motion.button
      key={event.id}
      layout
      initial={{ opacity: 0, x: 20, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full text-left group"
      onClick={() => onClick(event)}
    >
      <div
        className="flex gap-2 px-3 py-2 rounded hover:bg-white/5 transition-colors cursor-pointer border-l-2"
        style={{ borderLeftColor: color }}
      >
        <div className="flex-shrink-0 text-[10px] pt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="text-[9px] font-mono font-bold uppercase tracking-widest"
              style={{ color }}
            >
              {event.severity}
            </span>
            <span className="text-[9px] font-mono text-white/30">
              [{formatTime(event.timestamp)}]
            </span>
          </div>
          <p className="text-[10px] font-mono text-white/80 leading-snug truncate">
            {event.title}
          </p>
          {event.summary && (
            <p className="text-[9px] font-mono text-white/35 leading-snug mt-0.5 truncate">
              {event.summary.slice(0, 72)}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] text-[#00C2FF]/60 font-mono">src</span>
        </div>
      </div>
    </motion.button>
  )
}

interface EventTimelineProps {
  className?: string
}

export function EventTimeline({ className = "" }: EventTimelineProps) {
  const events = useLiveStore((s) => s.events)
  const connected = useLiveStore((s) => s.connected)
  const setSelectedSourceEvent = useTradeIntelligenceStore((s) => s.setSelectedSourceEvent)

  const handleClick = useCallback(
    (e: LiveEvent) => setSelectedSourceEvent(e),
    [setSelectedSourceEvent]
  )

  return (
    <div
      className={`flex flex-col ${className}`}
      style={{
        background: "rgba(3,8,16,0.88)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(0,194,255,0.12)",
        borderRadius: 10,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
        <div
          className="size-1.5 rounded-full animate-pulse"
          style={{ background: connected ? "#10B981" : "#FF4D6D" }}
        />
        <span className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-widest">
          Live Intel Feed
        </span>
        <span className="ml-auto text-[9px] font-mono text-white/30">
          {events.length} events
        </span>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto max-h-80 scrollbar-thin">
        <AnimatePresence initial={false} mode="popLayout">
          {events.slice(0, 20).map((e) => (
            <EventRow key={e.id} event={e} onClick={handleClick} />
          ))}
        </AnimatePresence>

        {events.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest">
              Awaiting stream...
            </p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-white/6">
        <p className="text-[8px] font-mono text-white/20 text-center">
          Click event → view source intelligence
        </p>
      </div>
    </div>
  )
}
