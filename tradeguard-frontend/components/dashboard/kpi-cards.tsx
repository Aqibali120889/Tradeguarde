"use client"

import { motion } from "framer-motion"
import { ShieldCheck, AlertTriangle, Package, Bot, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLiveStore, type KPISnapshot } from "@/stores/live-store"

// ─── Types ────────────────────────────────────────────────────────────────────

type Trend = "up" | "down" | "neutral"

interface KPICardDef {
  key:          keyof KPISnapshot
  trendKey:     keyof KPISnapshot
  title:        string
  icon:         React.ElementType
  iconClass:    string
  formatValue:  (v: number) => string
  formatTrend:  (v: number) => string
  goodDirection: Trend
}

const CARD_DEFS: KPICardDef[] = [
  {
    key: "compliance_score",    trendKey: "compliance_trend",
    title: "Compliance Score",  icon: ShieldCheck,
    iconClass: "text-intelligence bg-intelligence/10 border-intelligence/20",
    formatValue: (v) => `${v.toFixed(1)}%`,
    formatTrend: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    goodDirection: "up",
  },
  {
    key: "active_risks",        trendKey: "risks_trend",
    title: "Active Risks",      icon: AlertTriangle,
    iconClass: "text-critical bg-critical/10 border-critical/20",
    formatValue: (v) => String(v),
    formatTrend: (v) => `${v > 0 ? "+" : ""}${v}`,
    goodDirection: "down",
  },
  {
    key: "affected_shipments",  trendKey: "shipments_trend",
    title: "Affected Shipments", icon: Package,
    iconClass: "text-warning bg-warning/10 border-warning/20",
    formatValue: (v) => String(v),
    formatTrend: (v) => `${v > 0 ? "+" : ""}${v}`,
    goodDirection: "down",
  },
  {
    key: "autonomous_actions",  trendKey: "actions_trend",
    title: "Autonomous Actions", icon: Bot,
    iconClass: "text-monitoring bg-monitoring/10 border-monitoring/20",
    formatValue: (v) => v.toLocaleString(),
    formatTrend: (v) => `+${v}`,
    goodDirection: "up",
  },
]

// ─── Single Card ──────────────────────────────────────────────────────────────

function KPICard({ def, kpi, delay }: { def: KPICardDef; kpi: KPISnapshot; delay: number }) {
  const raw  = kpi[def.key] as number
  const rawT = kpi[def.trendKey] as number

  const trend: Trend = rawT > 0 ? "up" : rawT < 0 ? "down" : "neutral"
  const isPositive = trend === def.goodDirection
  const trendColor = trend === "neutral"
    ? "text-muted-foreground"
    : isPositive ? "text-success" : "text-critical"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className="enterprise-card p-5 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{def.title}</p>
        <div className={cn("size-8 flex items-center justify-center rounded-lg border", def.iconClass)}>
          <def.icon className="size-4" />
        </div>
      </div>

      {/* Value */}
      <div>
        <motion.span
          key={raw}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="text-3xl font-bold tracking-tight text-foreground tabular-nums"
        >
          {def.formatValue(raw)}
        </motion.span>
      </div>

      {/* Trend */}
      <div className="flex items-center gap-2">
        <span className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-muted/50",
          trendColor
        )}>
          {trend === "up"      && <TrendingUp className="size-3" />}
          {trend === "down"    && <TrendingDown className="size-3" />}
          {trend === "neutral" && <Minus className="size-3" />}
          {def.formatTrend(rawT)}
        </span>
        <span className="text-xs text-muted-foreground">vs. last period</span>
      </div>
    </motion.div>
  )
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function KPIGrid() {
  const kpi = useLiveStore((s) => s.kpi)

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARD_DEFS.map((def, idx) => (
        <KPICard key={def.key} def={def} kpi={kpi} delay={idx * 0.06} />
      ))}
    </div>
  )
}
