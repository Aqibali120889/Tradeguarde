"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useLiveStore, type LiveEvent } from "@/stores/live-store"

const SEV_COLOR: Record<string, string> = {
  critical: "#FF4D6D",
  warning:  "#FFB020",
  info:     "#00C2FF",
  success:  "#10B981",
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      + "." + String(d.getMilliseconds()).padStart(3, "0")
  } catch { return ts }
}

function EventRow({ event }: { event: LiveEvent }) {
  const color = SEV_COLOR[event.severity] ?? "#00C2FF"
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="font-mono text-[10px] leading-relaxed border-l-2 pl-3 py-1.5"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-white/30">[{formatTs(event.timestamp)}]</span>
        <span className="font-bold uppercase tracking-wider" style={{ color }}>{event.severity}</span>
        <span className="text-white/25">│</span>
        <span className="text-white/50">{event.agent}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-0.5">
        <span className="text-white/20">EVENT_ID:</span>
        <span className="text-white/50">{event.id.slice(0, 16)}</span>
        <span className="text-white/20">TOPIC:</span>
        <span style={{ color: `${color}99` }}>{event.topic || "—"}</span>
      </div>
      <div className="text-white/60 mt-0.5 truncate">{event.title}</div>
      {event.summary && (
        <div className="text-white/30 truncate">{event.summary.slice(0, 100)}</div>
      )}
    </motion.div>
  )
}

export function EventStream() {
  const events = useLiveStore((s) => s.events)
  const connected = useLiveStore((s) => s.connected)

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "rgba(8,17,32,0.85)", border: "1px solid rgba(0,194,255,0.10)" }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div
          className="size-1.5 rounded-full"
          style={{ background: connected ? "#10B981" : "#FF4D6D", animation: connected ? "pulse 2s infinite" : "none" }}
        />
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">
          Live Event Stream
        </span>
        <span className="ml-auto text-[9px] font-mono text-white/25">{events.length} buffered</span>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
        <AnimatePresence initial={false} mode="popLayout">
          {events.slice(0, 30).map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </AnimatePresence>
        {events.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
              Awaiting backend events…
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
