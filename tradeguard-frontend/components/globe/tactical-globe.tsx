"use client"

import React, {
  useEffect, useRef, useState, useCallback, useMemo
} from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLiveStore, type LiveEvent } from "@/stores/live-store"

// ─── Types ─────────────────────────────────────────────────────────────────

export type RouteSeverity = "healthy" | "warning" | "critical" | "rerouted"

export interface TradeRoute {
  id: string
  label: string
  origin: string
  destination: string
  originLng: number
  originLat: number
  destLng: number
  destLat: number
  severity: RouteSeverity
  value: string
  volume: string
  reason?: string
}

export const SEVERITY_COLOR: Record<RouteSeverity, string> = {
  healthy:  "#00C2FF",
  warning:  "#FFB020",
  critical: "#FF4D6D",
  rerouted: "#A78BFA",
}

export const SEVERITY_LABEL: Record<RouteSeverity, string> = {
  healthy:  "NOMINAL",
  warning:  "WARNING",
  critical: "CRITICAL",
  rerouted: "REROUTED",
}

// ─── Initial route data ────────────────────────────────────────────────────

const INITIAL_ROUTES: TradeRoute[] = [
  { id: "r1", label: "Shanghai → Rotterdam",    origin: "Shanghai",    destination: "Rotterdam",    originLng: 121.47, originLat: 31.23,  destLng: 4.48,    destLat: 51.92, severity: "warning",  value: "$2.1B/mo", volume: "41,200 TEU", reason: "Suez Canal congestion" },
  { id: "r2", label: "Los Angeles → Shanghai",  origin: "Los Angeles", destination: "Shanghai",    originLng: -118.19,originLat: 33.77,  destLng: 121.47,  destLat: 31.23, severity: "healthy",  value: "$1.4B/mo", volume: "28,900 TEU" },
  { id: "r3", label: "Singapore → Hamburg",     origin: "Singapore",   destination: "Hamburg",     originLng: 103.82, originLat: 1.35,   destLng: 9.99,    destLat: 53.55, severity: "healthy",  value: "$980M/mo",  volume: "19,400 TEU" },
  { id: "r4", label: "Dubai → New York",        origin: "Dubai",       destination: "New York",    originLng: 55.27,  originLat: 25.20,  destLng: -74.01,  destLat: 40.71, severity: "critical", value: "$670M/mo",  volume: "14,200 TEU", reason: "OFAC sanctions exposure" },
  { id: "r5", label: "Mumbai → Rotterdam",      origin: "Mumbai",      destination: "Rotterdam",   originLng: 72.88,  originLat: 19.08,  destLng: 4.48,    destLat: 51.92, severity: "healthy",  value: "$890M/mo",  volume: "17,800 TEU" },
  { id: "r6", label: "Hamburg → Singapore",     origin: "Hamburg",     destination: "Singapore",   originLng: 9.99,   originLat: 53.55,  destLng: 103.82,  destLat: 1.35,  severity: "warning",  value: "$540M/mo",  volume: "11,200 TEU", reason: "EU tariff escalation" },
  { id: "r7", label: "New York → Rotterdam",    origin: "New York",    destination: "Rotterdam",   originLng: -74.01, originLat: 40.71,  destLng: 4.48,    destLat: 51.92, severity: "healthy",  value: "$430M/mo",  volume: "8,900 TEU" },
  { id: "r8", label: "Shanghai → Los Angeles",  origin: "Shanghai",    destination: "Los Angeles", originLng: 121.47, originLat: 31.23,  destLng: -118.19, destLat: 33.77, severity: "critical", value: "$1.8B/mo",  volume: "36,100 TEU", reason: "US tariff 145% escalation" },
  { id: "r9", label: "Tokyo → Los Angeles",     origin: "Tokyo",       destination: "Los Angeles", originLng: 139.69, originLat: 35.68,  destLng: -118.19, destLat: 33.77, severity: "healthy",  value: "$1.1B/mo",  volume: "22,400 TEU" },
  { id: "r10",label: "Singapore → Sydney",      origin: "Singapore",   destination: "Sydney",      originLng: 103.82, originLat: 1.35,   destLng: 151.21,  destLat: -33.87,severity: "healthy",  value: "$310M/mo",  volume: "6,400 TEU" },
]

// ─── Apply live events to routes ───────────────────────────────────────────

function applyEventToRoutes(routes: TradeRoute[], event: LiveEvent): TradeRoute[] {
  const payload = event.payload as Record<string, string>
  const origin = payload?.origin ?? ""
  const destination = payload?.destination ?? ""
  const rawSeverity = (payload?.severity ?? event.severity) as string
  const severity = rawSeverity as RouteSeverity
  return routes.map((r) => {
    const match =
      (r.origin.toLowerCase().includes(origin.toLowerCase()) ||
        r.destination.toLowerCase().includes(origin.toLowerCase())) &&
      (r.destination.toLowerCase().includes(destination.toLowerCase()) ||
        r.origin.toLowerCase().includes(destination.toLowerCase()))
    if (match && origin && destination) {
      const resolvedSeverity: RouteSeverity = rawSeverity === "success" ? "rerouted" : rawSeverity === "info" ? r.severity : severity
      return { ...r, severity: resolvedSeverity, reason: event.summary?.slice(0, 60) || r.reason }
    }
    return r
  })
}

// ─── Tooltip ───────────────────────────────────────────────────────────────

interface TooltipData { x: number; y: number; route: TradeRoute }

function Tooltip({ data }: { data: TooltipData }) {
  const c = SEVERITY_COLOR[data.route.severity]
  return (
    <motion.div
      className="fixed z-50 pointer-events-none"
      style={{ left: data.x + 16, top: data.y - 8 }}
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      <div className="rounded-lg border p-3 min-w-[200px] shadow-2xl" style={{ background: "rgba(6,14,28,0.94)", backdropFilter: "blur(14px)", borderColor: `${c}40` }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="size-2 rounded-full animate-pulse" style={{ background: c }} />
          <span className="text-[11px] font-bold text-white/90 font-mono uppercase tracking-wider">{data.route.label}</span>
        </div>
        <div className="space-y-1">
          {[
            { label: "STATUS",   value: SEVERITY_LABEL[data.route.severity], color: c },
            { label: "VALUE",    value: data.route.value },
            { label: "VOLUME",   value: data.route.volume },
          ].map(item => (
            <div key={item.label} className="flex justify-between gap-6 text-[10px]">
              <span className="text-white/40 font-mono">{item.label}</span>
              <span className="font-mono" style={{ color: item.color ?? "rgba(255,255,255,0.8)" }}>{item.value}</span>
            </div>
          ))}
          {data.route.reason && (
            <div className="pt-1 mt-1 border-t border-white/10">
              <span className="text-[9px] font-mono text-[#FFB020]/80">⚠ {data.route.reason}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main Tactical Globe ───────────────────────────────────────────────────

interface TacticalGlobeProps {
  onRouteClick?: (route: TradeRoute) => void
  onRouteHover?: (route: TradeRoute | null) => void
}

export default function TacticalGlobe({ onRouteClick, onRouteHover }: TacticalGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<any>(null)
  const [Globe, setGlobe] = useState<any>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [routes, setRoutes] = useState<TradeRoute[]>(INITIAL_ROUTES)

  // Live SSE event updates
  const liveEvents = useLiveStore((s) => s.events)
  const prevLen = useRef(0)
  useEffect(() => {
    if (liveEvents.length > prevLen.current) {
      const ev = liveEvents[0]
      if (ev.payload?.origin && ev.payload?.destination) {
        setRoutes(prev => applyEventToRoutes(prev, ev))
      }
      prevLen.current = liveEvents.length
    }
  }, [liveEvents])

  // Dynamic import of react-globe.gl (client-only)
  useEffect(() => {
    import("react-globe.gl").then(mod => setGlobe(() => mod.default))
  }, [])

  // Measure container via ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Arc data for react-globe.gl
  const arcData = useMemo(() => routes.map(r => ({
    startLat: r.originLat,
    startLng: r.originLng,
    endLat: r.destLat,
    endLng: r.destLng,
    color: [SEVERITY_COLOR[r.severity] + "DD", SEVERITY_COLOR[r.severity] + "22"],
    severity: r.severity,
    routeId: r.id,
    dashLength: r.severity === "critical" ? 0.3 : 0.6,
    dashGap: r.severity === "critical" ? 0.1 : 0.3,
    dashAnimateTime: r.severity === "critical" ? 1200 : 2500,
    strokeWidth: r.severity === "critical" ? 1.0 : 0.7,
    altitude: 0.28,
  })), [routes])

  // Ring/pulse data at port locations
  const ringData = useMemo(() => {
    const ports = new Map<string, { lat: number; lng: number; sev: RouteSeverity }>()
    routes.forEach(r => {
      const key1 = `${r.originLat},${r.originLng}`
      const key2 = `${r.destLat},${r.destLng}`
      if (!ports.has(key1)) ports.set(key1, { lat: r.originLat, lng: r.originLng, sev: r.severity })
      if (!ports.has(key2)) ports.set(key2, { lat: r.destLat, lng: r.destLng, sev: r.severity })
      else {
        // Escalate severity
        const existing = ports.get(key2)!
        const order: RouteSeverity[] = ["healthy", "rerouted", "warning", "critical"]
        if (order.indexOf(r.severity) > order.indexOf(existing.sev)) ports.set(key2, { ...existing, sev: r.severity })
      }
    })
    return Array.from(ports.values()).map(p => ({
      lat: p.lat, lng: p.lng,
      maxR: p.sev === "critical" ? 3.5 : p.sev === "warning" ? 2.5 : 1.8,
      propagationSpeed: p.sev === "critical" ? 3 : 2,
      repeatPeriod: p.sev === "critical" ? 800 : 1400,
      color: SEVERITY_COLOR[p.sev],
    }))
  }, [routes])

  // Point data (port labels)
  const pointData = useMemo(() => {
    const portInfo: Record<string, string> = {
      "31.23,121.47": "Shanghai",
      "51.92,4.48":   "Rotterdam",
      "1.35,103.82":  "Singapore",
      "33.77,-118.19":"Los Angeles",
      "53.55,9.99":   "Hamburg",
      "25.20,55.27":  "Dubai",
      "19.08,72.88":  "Mumbai",
      "40.71,-74.01": "New York",
      "35.68,139.69": "Tokyo",
      "-33.87,151.21":"Sydney",
    }
    return Object.entries(portInfo).map(([key, name]) => {
      const [lat, lng] = key.split(",").map(Number)
      const route = routes.find(r =>
        (Math.abs(r.originLat - lat) < 1 && Math.abs(r.originLng - lng) < 1) ||
        (Math.abs(r.destLat - lat) < 1 && Math.abs(r.destLng - lng) < 1)
      )
      const sev = route?.severity ?? "healthy"
      return { lat, lng, name, color: SEVERITY_COLOR[sev], size: sev === "critical" ? 0.6 : 0.4 }
    })
  }, [routes])

  const handleArcHover = useCallback((arc: any, _prev: any, event: any) => {
    if (!arc) { setTooltip(null); onRouteHover?.(null); return }
    const route = routes.find(r => r.id === arc.routeId)
    if (route && event?.clientX != null) {
      setTooltip({ x: event.clientX, y: event.clientY, route })
      onRouteHover?.(route)
    } else if (route) {
      onRouteHover?.(route)
    }
  }, [routes, onRouteHover])

  const handleArcClick = useCallback((arc: any) => {
    const route = routes.find(r => r.id === arc?.routeId)
    if (route) onRouteClick?.(route)
  }, [routes, onRouteClick])

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#030810]">
      {/* Loading state */}
      {(!Globe || dimensions.w === 0) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <div className="relative mb-5">
            <div className="size-16 rounded-full border border-[#00C2FF]/20 animate-ping absolute inset-0" />
            <div className="size-16 rounded-full border-2 border-t-[#00C2FF]/80 border-[#00C2FF]/10 animate-spin" />
          </div>
          <p className="font-mono text-xs tracking-[0.3em] text-[#00C2FF]/60 uppercase">Initializing Globe</p>
        </div>
      )}

      {/* Globe */}
      {Globe && dimensions.w > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.w}
          height={dimensions.h}
          backgroundColor="rgba(0,0,0,0)"
          // Globe appearance — blue marble with dark tactical tint
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          atmosphereColor="#1a6fa8"
          atmosphereAltitude={0.18}
          // Camera — zoomed out to show full globe
          onGlobeReady={() => {
            if (globeRef.current) {
              globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.8 })
              // Slow auto-rotate
              const controls = globeRef.current.controls()
              if (controls) {
                controls.autoRotate = true
                controls.autoRotateSpeed = 0.4
                controls.enableDamping = true
                controls.dampingFactor = 0.05
              }
            }
          }}
          // Animated trade arcs
          arcsData={arcData}
          arcColor="color"
          arcAltitude="altitude"
          arcStroke="strokeWidth"
          arcDashLength="dashLength"
          arcDashGap="dashGap"
          arcDashAnimateTime="dashAnimateTime"
          onArcHover={handleArcHover}
          onArcClick={handleArcClick}
          arcLabel={(d: any) => {
            const r = routes.find(r => r.id === d.routeId)
            return r ? `<div style="font-family:monospace;font-size:11px;color:white;background:rgba(6,14,28,0.9);padding:4px 8px;border-radius:4px">${r.label}</div>` : ""
          }}
          // Pulsing rings at ports
          ringsData={ringData}
          ringColor="color"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
          // Port points
          pointsData={pointData}
          pointColor="color"
          pointAltitude={0.01}
          pointRadius="size"
          pointLabel={(d: any) => `<div style="font-family:monospace;font-size:10px;color:#A0C8E8;background:rgba(6,14,28,0.9);padding:2px 6px;border-radius:3px">${d.name}</div>`}
          enablePointerInteraction
        />
      )}

      {/* Tactical grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(0,194,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(0,194,255,0.018) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Corner brackets */}
      {[["top-0 left-0", "top-4 left-4"], ["top-0 right-0", "top-4 right-4"], ["bottom-0 left-0", "bottom-4 left-4"], ["bottom-0 right-0", "bottom-4 right-4"]].map(([pos, inner], i) => (
        <div key={i} className={`absolute ${pos} w-16 h-16 pointer-events-none`}>
          <div className={`absolute ${inner} w-8 h-px bg-[#00C2FF]/40`} />
          <div className={`absolute ${inner} w-px h-8 bg-[#00C2FF]/40`} />
        </div>
      ))}

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && <Tooltip data={tooltip} />}
      </AnimatePresence>
    </div>
  )
}
