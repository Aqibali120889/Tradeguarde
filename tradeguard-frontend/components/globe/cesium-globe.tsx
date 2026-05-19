"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTradeIntelligenceStore } from "@/stores/trade-intelligence-store"
import { useGlobeEvents } from "@/hooks/use-globe-events"
import { EventTimeline } from "./ui/event-timeline"
import { SourceInspectionModal } from "./ui/source-inspection-modal"

// ─── Cesium dynamic import (client-only) ───────────────────────────────────
let Cesium: typeof import("cesium") | null = null

// ─── Severity → CSS color helpers ─────────────────────────────────────────
const SEVERITY_COLOR: Record<string, string> = {
  healthy:  "#00C2FF",
  warning:  "#FFB020",
  critical: "#FF4D6D",
  rerouted: "#A78BFA",
}

const SEVERITY_LABEL: Record<string, string> = {
  healthy:  "NOMINAL",
  warning:  "WARNING",
  critical: "CRITICAL",
  rerouted: "REROUTED",
}

interface TooltipData {
  x: number
  y: number
  label: string
  severity: string
  value: string
  volume: string
  reason?: string
}

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const animFrameRef = useRef<number>(0)
  const [isReady, setIsReady] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  // Initialize event pipeline
  useGlobeEvents()

  const routes = useTradeIntelligenceStore((s) => s.routes)
  const ports = useTradeIntelligenceStore((s) => s.ports)
  const sanctions = useTradeIntelligenceStore((s) => s.sanctions)
  const shockwaves = useTradeIntelligenceStore((s) => s.shockwaves)

  // ── Initialize Cesium viewer ─────────────────────────────────────────────
  useEffect(() => {
    let viewer: any = null
    let destroyed = false

    async function init() {
      if (!containerRef.current) return

      const CesiumLib = await import("cesium")
      Cesium = CesiumLib

      const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN
      if (ionToken) {
        CesiumLib.Ion.defaultAccessToken = ionToken
      }

      ;(window as any).CESIUM_BASE_URL = "/cesium"
      if (destroyed || !containerRef.current) return

      viewer = new CesiumLib.Viewer(containerRef.current, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        creditContainer: document.createElement("div"),
        imageryProvider: false as any,
      })

      viewerRef.current = viewer

      const scene = viewer.scene
      scene.backgroundColor = new CesiumLib.Color(0.02, 0.04, 0.08, 1.0)
      scene.skyAtmosphere.hueShift = -0.1
      scene.skyAtmosphere.saturationShift = 0.1
      scene.skyAtmosphere.brightnessShift = -0.3
      scene.fog.enabled = true
      scene.fog.density = 0.00005
      scene.fog.minimumBrightness = 0.05
      scene.globe.enableLighting = false
      viewer.imageryLayers.removeAll()
      scene.globe.baseColor = new CesiumLib.Color(0.04, 0.10, 0.20, 1.0)
      scene.globe.showGroundAtmosphere = true
      scene.globe.atmosphereBrightnessShift = -0.3
      scene.globe.atmosphereSaturationShift = -0.2

      viewer.camera.setView({
        destination: CesiumLib.Cartesian3.fromDegrees(20, 20, 18000000),
        orientation: {
          heading: CesiumLib.Math.toRadians(0),
          pitch: CesiumLib.Math.toRadians(-25),
          roll: 0,
        },
      })

      scene.screenSpaceCameraController.enableTilt = true
      scene.screenSpaceCameraController.enableTranslate = true
      scene.screenSpaceCameraController.enableZoom = true
      scene.screenSpaceCameraController.minimumZoomDistance = 2000000
      scene.screenSpaceCameraController.maximumZoomDistance = 30000000

      if (!destroyed) {
        setIsReady(true)
      }
    }

    init().catch(console.error)

    return () => {
      destroyed = true
      cancelAnimationFrame(animFrameRef.current)
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
    }
  }, [])

  // ── Auto-rotate ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady || !viewerRef.current || !Cesium) return
    const viewer = viewerRef.current
    const C = Cesium
    let lastTime = performance.now()
    const ROTATE_SPEED = 0.02

    function tick() {
      const now = performance.now()
      const dt = now - lastTime
      lastTime = now

      if (viewer && !viewer.isDestroyed()) {
        const camera = viewer.camera
        camera.rotateRight(-C.Math.toRadians(ROTATE_SPEED * dt / 16))
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isReady])

  // ── Render Entities ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady || !viewerRef.current || !Cesium) return
    const viewer = viewerRef.current
    const C = Cesium

    // Clear previous entities
    viewer.entities.removeAll()

    // 1. Render Shockwaves
    shockwaves.forEach((sw) => {
      const age = Date.now() - sw.timestamp
      if (age > 3000) return
      
      const radius = 100000 + (age / 3000) * 4000000 // grows up to 4000km
      const alpha = 1 - (age / 3000)
      
      const color = C.Color.fromCssColorString(sw.color).withAlpha(alpha * 0.5)

      viewer.entities.add({
        id: `sw-${sw.id}`,
        position: C.Cartesian3.fromDegrees(sw.lng, sw.lat),
        ellipse: {
          semiMinorAxis: radius,
          semiMajorAxis: radius,
          material: new C.ColorMaterialProperty(color),
          outline: true,
          outlineColor: color.withAlpha(alpha),
        }
      })
    })

    // 2. Render Sanctions
    Object.values(sanctions).forEach((sz) => {
      const positions = C.Cartesian3.fromDegreesArray(sz.coordinates)
      const color = sz.severity === "critical" ? "rgba(255,77,109,0.15)" : "rgba(255,176,32,0.15)"
      const outlineColor = sz.severity === "critical" ? "rgba(255,77,109,0.6)" : "rgba(255,176,32,0.6)"
      
      viewer.entities.add({
        id: sz.id,
        polygon: {
          hierarchy: new C.PolygonHierarchy(positions),
          material: C.Color.fromCssColorString(color),
          outline: true,
          outlineColor: C.Color.fromCssColorString(outlineColor),
          outlineWidth: 2,
          height: 0,
          fill: true,
        },
      })
    })

    // 3. Render Ports
    Object.values(ports).forEach((port) => {
      const statusColors: Record<string, string> = {
        operational: "#00C2FF",
        congested:   "#FFB020",
        sanctioned:  "#FF4D6D",
        restricted:  "#FF4D6D",
      }
      const color = C.Color.fromCssColorString(statusColors[port.status] ?? "#00C2FF")

      viewer.entities.add({
        id: port.id,
        position: C.Cartesian3.fromDegrees(port.lng, port.lat, 10000),
        point: {
          pixelSize: port.status === "operational" ? 6 : 8,
          color: color,
          outlineColor: color.withAlpha(0.4),
          outlineWidth: 8,
          heightReference: C.HeightReference.NONE,
        },
        label: {
          text: port.name,
          font: "11px 'Courier New', monospace",
          fillColor: C.Color.fromCssColorString("rgba(200,220,255,0.85)"),
          outlineColor: C.Color.fromCssColorString("rgba(0,0,0,0.8)"),
          outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          pixelOffset: new C.Cartesian2(0, -16),
          scale: 0.9,
          heightReference: C.HeightReference.NONE,
          translucencyByDistance: new C.NearFarScalar(2000000, 1.0, 18000000, 0.0),
        },
      })
    })

    // 4. Render Routes
    Object.values(routes).forEach((route) => {
      const color = C.Color.fromCssColorString(SEVERITY_COLOR[route.severity] || "#00C2FF")
      const positions = C.Cartesian3.fromDegreesArray([
        route.originLng, route.originLat,
        route.destLng, route.destLat,
      ])

      const arcPositions: any[] = []
      const steps = 80
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const lng = route.originLng + t * (route.destLng - route.originLng)
        const lat = route.originLat + t * (route.destLat - route.originLat)
        const altitude = Math.sin(Math.PI * t) * 1_200_000
        arcPositions.push(C.Cartesian3.fromDegrees(lng, lat, altitude))
      }

      viewer.entities.add({
        id: `route-glow-${route.id}`,
        polyline: {
          positions: arcPositions,
          width: route.severity === "rerouted" ? 8 : 6,
          material: new C.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            taperPower: 0.5,
            color: color.withAlpha(0.25),
          }),
          clampToGround: false,
          arcType: C.ArcType.NONE,
        },
      })

      viewer.entities.add({
        id: `route-${route.id}`,
        polyline: {
          positions: arcPositions,
          width: route.severity === "critical" || route.severity === "rerouted" ? 2.5 : 1.8,
          material: new C.PolylineDashMaterialProperty({
            color: color.withAlpha(0.9),
            dashLength: 24,
            dashPattern: route.severity === "critical" ? 0xFF00 : 0xFF80,
          }),
          clampToGround: false,
          arcType: C.ArcType.NONE,
        },
      })
    })

  }, [isReady, routes, ports, sanctions, shockwaves])

  // ── Mouse interaction — hover tooltip ──────────────────────────────────────
  useEffect(() => {
    if (!isReady || !viewerRef.current || !Cesium) return
    const viewer = viewerRef.current
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

    handler.setInputAction((movement: any) => {
      const picked = viewer.scene.pick(movement.endPosition)
      if (Cesium!.defined(picked) && picked.id) {
        const entityId: string = typeof picked.id === "string"
          ? picked.id
          : picked.id?.id ?? ""

        if (entityId.startsWith("route-") && !entityId.startsWith("route-glow-")) {
          const routeId = entityId.replace("route-", "")
          const route = routes[routeId]
          if (route) {
            const canvasBounds = viewer.scene.canvas.getBoundingClientRect()
            setTooltip({
              x: movement.endPosition.x + canvasBounds.left,
              y: movement.endPosition.y + canvasBounds.top,
              label: route.label,
              severity: route.severity,
              value: route.shipmentCount.toString() + " Shipments",
              volume: "Risk: " + route.riskScore,
              reason: route.reason,
            })
            viewer.scene.canvas.style.cursor = "crosshair"
            return
          }
        }
      }
      setTooltip(null)
      viewer.scene.canvas.style.cursor = "grab"
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    return () => handler.destroy()
  }, [isReady, routes])

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#030810]">
      {/* Cesium container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Floating Timeline Panel */}
      <div className="absolute left-6 top-6 w-[340px] z-40">
        <EventTimeline />
      </div>

      <SourceInspectionModal />

      {/* Loading overlay */}
      <AnimatePresence>
        {!isReady && (
          <motion.div
            key="loader"
            className="absolute inset-0 flex flex-col items-center justify-center bg-[#030810] z-20"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="relative mb-5">
              <div className="size-16 rounded-full border border-[#00C2FF]/20 animate-ping absolute inset-0" />
              <div className="size-16 rounded-full border-2 border-t-[#00C2FF]/80 border-[#00C2FF]/10 animate-spin" />
            </div>
            <p className="font-mono text-xs tracking-[0.3em] text-[#00C2FF]/60 uppercase">
              Initializing Geospatial Engine
            </p>
            <p className="font-mono text-[10px] tracking-widest text-[#00C2FF]/30 mt-1 uppercase">
              Live Intel Mode
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover tooltip */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            key="tooltip"
            className="fixed z-50 pointer-events-none"
            style={{ left: tooltip.x + 16, top: tooltip.y - 8 }}
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="rounded-lg border p-3 shadow-2xl min-w-[200px]"
              style={{
                background: "rgba(8,16,32,0.92)",
                backdropFilter: "blur(12px)",
                borderColor: `${SEVERITY_COLOR[tooltip.severity]}40`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="size-2 rounded-full animate-pulse"
                  style={{ background: SEVERITY_COLOR[tooltip.severity] }}
                />
                <span className="text-[11px] font-bold text-white/90 font-mono uppercase tracking-wider">
                  {tooltip.label}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between gap-6 text-[10px]">
                  <span className="text-white/40 font-mono">STATUS</span>
                  <span
                    className="font-bold font-mono"
                    style={{ color: SEVERITY_COLOR[tooltip.severity] }}
                  >
                    {SEVERITY_LABEL[tooltip.severity]}
                  </span>
                </div>
                <div className="flex justify-between gap-6 text-[10px]">
                  <span className="text-white/40 font-mono">ACTIVITY</span>
                  <span className="text-white/80 font-mono">{tooltip.value}</span>
                </div>
                <div className="flex justify-between gap-6 text-[10px]">
                  <span className="text-white/40 font-mono">IMPACT</span>
                  <span className="text-white/80 font-mono">{tooltip.volume}</span>
                </div>
                {tooltip.reason && (
                  <div className="pt-1 mt-1 border-t border-white/10">
                    <span className="text-[9px] font-mono text-[#FFB020]/80 leading-relaxed">
                      ⚠ {tooltip.reason}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tactical grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,194,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,194,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  )
}
