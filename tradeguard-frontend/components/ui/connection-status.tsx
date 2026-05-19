"use client"

import { useLiveStore } from "@/stores/live-store"
import { cn } from "@/lib/utils"
import { useLiveStream } from "@/hooks/use-live-stream"

/** Initializes the SSE connection and exposes a compact status badge. */
export function ConnectionStatus() {
  const { connected, reconnecting } = useLiveStream()

  const label = connected ? "LIVE" : reconnecting ? "RECONNECTING" : "OFFLINE"
  const dotClass = connected
    ? "bg-success"
    : reconnecting
    ? "bg-warning"
    : "bg-critical"
  const textClass = connected
    ? "text-success"
    : reconnecting
    ? "text-warning"
    : "text-critical"
  const bgClass = connected
    ? "bg-success/10 border-success/20"
    : reconnecting
    ? "bg-warning/10 border-warning/20"
    : "bg-critical/10 border-critical/20"

  return (
    <div className={cn("hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500", bgClass)}>
      <span className="relative flex size-2">
        {(connected || reconnecting) && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", dotClass)} />
        )}
        <span className={cn("relative inline-flex rounded-full size-2", dotClass)} />
      </span>
      <span className={cn("text-[10px] font-bold uppercase tracking-widest", textClass)}>
        {label}
      </span>
    </div>
  )
}
