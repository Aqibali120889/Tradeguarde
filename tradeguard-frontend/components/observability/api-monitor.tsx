"use client"

import { motion } from "framer-motion"
import { Globe, Clock, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react"
import { useObservabilityStore, type ApiEndpointStatus } from "@/stores/observability-store"

const STATUS_COLOR: Record<string, string> = {
  operational: "#10B981",
  degraded:    "#FFB020",
  down:        "#FF4D6D",
  unknown:     "#7D8CA3",
}

const STATUS_ICON: Record<string, React.ElementType> = {
  operational: CheckCircle2,
  degraded:    AlertTriangle,
  down:        AlertTriangle,
  unknown:     HelpCircle,
}

function ApiRow({ api, idx }: { api: ApiEndpointStatus; idx: number }) {
  const color = STATUS_COLOR[api.status]
  const Icon = STATUS_ICON[api.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05, duration: 0.3 }}
      className="grid grid-cols-6 items-center gap-2 px-3 py-2.5 hover:bg-white/3 transition-colors"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
    >
      {/* Name */}
      <div className="col-span-2 flex items-center gap-2">
        <Globe size={12} className="text-white/30 flex-shrink-0" />
        <div>
          <p className="text-[10px] font-mono font-bold text-white/80">{api.name}</p>
          <p className="text-[8px] font-mono text-white/25 truncate">{api.url}</p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <Icon size={11} style={{ color }} />
        <span className="text-[9px] font-mono font-bold uppercase" style={{ color }}>
          {api.status}
        </span>
      </div>

      {/* Latency */}
      <div className="flex items-center gap-1">
        <Clock size={10} className="text-white/25" />
        <span className="text-[10px] font-mono text-white/60">
          {api.latencyMs !== null ? `${api.latencyMs}ms` : "—"}
        </span>
      </div>

      {/* Requests */}
      <div>
        <span className="text-[10px] font-mono text-white/60">{api.requestCount} req</span>
        {api.errorCount > 0 && (
          <span className="text-[9px] font-mono text-[#FF4D6D] ml-1">({api.errorCount} err)</span>
        )}
      </div>

      {/* Last Fetch */}
      <div className="text-[9px] font-mono text-white/35 truncate">
        {api.lastFetch
          ? new Date(api.lastFetch).toLocaleTimeString("en-US", { hour12: false })
          : "Never"}
      </div>
    </motion.div>
  )
}

export function ApiMonitor() {
  const apis = useObservabilityStore((s) => s.apiEndpoints)

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "rgba(8,17,32,0.85)", border: "1px solid rgba(0,194,255,0.10)" }}
    >
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">
          API Intelligence Sources
        </span>
      </div>

      {/* Header */}
      <div
        className="grid grid-cols-6 gap-2 px-3 py-1.5 text-[8px] font-mono text-white/25 uppercase tracking-widest"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="col-span-2">Source</span>
        <span>Status</span>
        <span>Latency</span>
        <span>Volume</span>
        <span>Last Fetch</span>
      </div>

      {apis.map((api, i) => (
        <ApiRow key={api.key} api={api} idx={i} />
      ))}
    </div>
  )
}
