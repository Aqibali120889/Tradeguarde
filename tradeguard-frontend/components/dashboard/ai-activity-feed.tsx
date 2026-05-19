"use client"

import { motion, AnimatePresence } from "framer-motion"
import {
  Eye, Zap, ShieldAlert, Map, Send, MessageSquare,
  Bot, CheckCircle2, AlertTriangle, Info, XCircle, Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLiveStore, type LiveEvent, type Severity } from "@/stores/live-store"

// ─── Config Maps ──────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  watchdog:         Eye,
  impact_analyzer:  Zap,
  sanctions_engine: ShieldAlert,
  action_planner:   Map,
  execution:        Send,
  communication:    MessageSquare,
  communicator:     MessageSquare,
  governance:       ShieldAlert,
  system:           Bot,
}

const SEVERITY_CONFIG: Record<Severity, {
  dotClass: string
  badgeClass: string
  label: string
  Icon: React.ElementType
}> = {
  info:     {
    dotClass: "bg-intelligence",
    badgeClass: "badge-info",
    label: "INFO",
    Icon: Info,
  },
  warning:  {
    dotClass: "bg-warning",
    badgeClass: "badge-warning",
    label: "WARNING",
    Icon: AlertTriangle,
  },
  critical: {
    dotClass: "bg-critical",
    badgeClass: "badge-critical",
    label: "CRITICAL",
    Icon: XCircle,
  },
  success:  {
    dotClass: "bg-success",
    badgeClass: "badge-success",
    label: "COMPLETED",
    Icon: CheckCircle2,
  },
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Activity Item ────────────────────────────────────────────────────────────

function ActivityItem({ item }: { item: LiveEvent }) {
  const AgentIcon = AGENT_ICONS[item.agent] ?? Bot
  const config = SEVERITY_CONFIG[item.severity]
  const { Icon: StatusIcon } = config
  const isCritical = item.severity === "critical"

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group flex items-start gap-3 py-3 border-b border-border/40 last:border-b-0 px-1 hover:bg-muted/20 transition-colors duration-150 rounded-sm -mx-1"
    >
      {/* Severity dot */}
      <div className="relative flex mt-1.5 shrink-0">
        {isCritical && (
          <span className={cn("live-indicator-ping absolute", config.dotClass)} />
        )}
        <span className={cn("live-indicator-dot", config.dotClass)} />
      </div>

      {/* Agent icon */}
      <div className="shrink-0 size-6 flex items-center justify-center rounded-md bg-muted/50 border border-border/50 mt-0.5">
        <AgentIcon className="size-3 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold text-foreground truncate capitalize">
              {item.agent.replace(/_/g, " ")}
            </span>
            <span className={cn("shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide", config.badgeClass)}>
              <StatusIcon className="size-2.5" />
              {config.label}
            </span>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground font-mono tabular-nums">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {item.title || item.summary || item.topic}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2">
          <div className="size-2 rounded-full bg-muted/60 animate-pulse mt-1.5 shrink-0" />
          <div className="size-6 rounded-md bg-muted/60 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-28 rounded bg-muted/60 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-muted/40 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Feed ────────────────────────────────────────────────────────────────

export function AIActivityFeed() {
  const agentActivity = useLiveStore((s) => s.agentActivity)
  const connected     = useLiveStore((s) => s.connected)
  const reconnecting  = useLiveStore((s) => s.reconnecting)

  const isLoading = !connected && agentActivity.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <Bot className="size-3.5 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground font-mono">
            {agentActivity.length} events
          </span>
        </div>
        {reconnecting && (
          <div className="flex items-center gap-1 text-[10px] text-warning">
            <Loader2 className="size-3 animate-spin" />
            <span>Reconnecting</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <ActivitySkeleton />
        ) : agentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <Bot className="size-6 opacity-25" />
            <span className="text-xs">Awaiting agent events</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {agentActivity.map((item) => (
              <ActivityItem key={item.id} item={item} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
