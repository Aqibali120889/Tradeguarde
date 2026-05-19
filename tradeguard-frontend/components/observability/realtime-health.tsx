"use client"

import { motion } from "framer-motion"
import {
  Wifi, WifiOff, Users, Zap, Clock, CheckCircle2,
  XCircle, RotateCw, Shield, Ship, Database,
} from "lucide-react"
import { useObservabilityStore } from "@/stores/observability-store"

const fmtNum = (n: number) => n.toLocaleString()

export function RealtimeHealth() {
  const health = useObservabilityStore((s) => s.health)

  const cards = [
    {
      label: "SSE Stream",
      value: health.sseConnected ? "CONNECTED" : "DISCONNECTED",
      icon: health.sseConnected ? Wifi : WifiOff,
      color: health.sseConnected ? "#10B981" : "#FF4D6D",
    },
    { label: "Active Agents",       value: fmtNum(health.activeAgents),       icon: Users,        color: "#00C2FF" },
    { label: "Events / min",        value: fmtNum(health.eventsPerMin),       icon: Zap,          color: "#A78BFA" },
    { label: "Avg Latency",         value: `${health.avgLatencyMs}ms`,        icon: Clock,        color: "#FFB020" },
    { label: "Workflows Done",      value: fmtNum(health.workflowsCompleted), icon: CheckCircle2, color: "#10B981" },
    { label: "Workflows Failed",    value: fmtNum(health.workflowsFailed),    icon: XCircle,      color: "#FF4D6D" },
    { label: "Reroutes Executed",   value: fmtNum(health.reroutesExecuted),   icon: RotateCw,     color: "#A78BFA" },
    { label: "Sanctions Detected",  value: fmtNum(health.sanctionsDetected),  icon: Shield,       color: "#FF4D6D" },
    { label: "Active Trade Routes", value: fmtNum(health.activeTradeRoutes),  icon: Ship,         color: "#00C2FF" },
    { label: "Ingestion Queue",     value: fmtNum(health.ingestionQueueSize), icon: Database,     color: "#FFB020" },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          className="rounded-lg p-3"
          style={{
            background: "rgba(16,26,44,0.7)",
            border: `1px solid ${c.color}18`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <c.icon size={13} style={{ color: c.color }} />
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest truncate">
              {c.label}
            </span>
          </div>
          <motion.span
            key={c.value}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            className="text-base font-bold font-mono block"
            style={{ color: c.color }}
          >
            {c.value}
          </motion.span>
        </motion.div>
      ))}
    </div>
  )
}
