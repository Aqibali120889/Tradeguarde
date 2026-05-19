"use client"

import React from "react"
import { useAgentStore } from "@/stores/agent-store"
import { useLiveStore } from "@/stores/live-store"
import { cn } from "@/lib/utils"

// Enterprise status badge styles — consistent with global badge system
const SEV_BADGE: Record<string, string> = {
  info:     "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  warning:  "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  critical: "bg-red-500/10 text-red-400 border border-red-500/20",
  success:  "bg-green-500/10 text-green-400 border border-green-500/20",
}

const SEV_LABEL: Record<string, string> = {
  info:     "Processing",
  warning:  "Flagged",
  critical: "Critical",
  success:  "Cleared",
}

const COL_WIDTHS = "grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]"

function TableHeader() {
  return (
    <div className={`grid ${COL_WIDTHS} bg-muted/40 border-b border-border`}>
      {["Shipment / Event", "Route / Context", "Agent", "Status", "Source"].map(h => (
        <div
          key={h}
          className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
        >
          {h}
        </div>
      ))}
    </div>
  )
}

export default function LiveTradeTable() {
  const executionFeed = useAgentStore(s => s.executionFeed)
  const liveEvents    = useLiveStore(s => s.events)

  const rows = React.useMemo(() => {
    const fromFeed = executionFeed.slice(0, 8).map(e => ({
      id: e.id,
      shipmentId: extractShipmentId(e.action) || `SHP-${e.id.slice(-5)}`,
      route: extractRoute(e.action),
      agent: e.agentName,
      agentId: e.agentId,
      action: e.action,
      severity: e.severity,
      timestamp: e.timestamp,
      source: "execution-feed",
    }))

    const fromEvents = liveEvents.slice(0, 5).map(e => ({
      id: e.id,
      shipmentId: e.affected_entities[0] || `SHP-${e.id.slice(-5)}`,
      route: extractRoute(e.summary || e.title),
      agent: e.agent,
      agentId: e.agent?.toLowerCase(),
      action: e.title,
      severity: e.severity,
      timestamp: e.timestamp,
      source: `sse:${e.id.slice(0, 8)}`,
    }))

    return [...fromFeed, ...fromEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }, [executionFeed, liveEvents])

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border overflow-hidden">
        <TableHeader />
        <div className="p-10 text-center">
          <div className="size-5 rounded-full border border-border animate-spin border-t-muted-foreground/60 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Awaiting agent events from SSE stream…</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Connect to backend at /api/stream/events to populate live data.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <TableHeader />
      <div className="divide-y divide-border/60">
        {rows.map(row => (
          <div
            key={row.id}
            className={`grid ${COL_WIDTHS} items-center hover:bg-muted/25 transition-colors duration-100`}
          >
            {/* Shipment ID — monospace, clearly readable */}
            <div className="px-3 py-2.5 font-mono text-xs text-muted-foreground truncate">
              {row.shipmentId}
            </div>

            {/* Route — main content text */}
            <div className="px-3 py-2.5 text-sm text-foreground truncate">
              {row.route || <span className="text-muted-foreground/50">—</span>}
            </div>

            {/* Agent name */}
            <div className="px-3 py-2.5 text-xs text-muted-foreground truncate capitalize">
              {row.agent}
            </div>

            {/* Status badge */}
            <div className="px-3 py-2.5">
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                  SEV_BADGE[row.severity] || SEV_BADGE.info
                )}
              >
                {SEV_LABEL[row.severity] || row.severity}
              </span>
            </div>

            {/* Source lineage */}
            <div className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground/60 truncate">
              {row.source}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractShipmentId(text: string): string | null {
  const m = text.match(/\b(TG-\d+|SHP-\d+|WF-\w+)\b/)
  return m ? m[1] : null
}

function extractRoute(text: string): string {
  const m = text.match(/(\w[\w\s]+)\s*[→→>\-]+\s*(\w[\w\s]+)/u)
  if (m) return `${m[1].trim()} → ${m[2].trim()}`

  const regions = ["Shanghai", "Rotterdam", "Singapore", "Hamburg", "Los Angeles", "Mumbai", "Shenzhen", "Dubai", "Cape Town"]
  const found = regions.filter(r => text.includes(r))
  if (found.length >= 2) return `${found[0]} → ${found[1]}`
  return ""
}
