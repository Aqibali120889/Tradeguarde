"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'
import Globe from 'react-globe.gl'
import { useTheme } from 'next-themes'
import * as THREE from 'three'

// ─── Operational Mock Data ──────────────────────────────────────────────────

const ARC_DATA = [
  { startLat: 31.2304, startLng: 121.4737, endLat: 33.7701, endLng: -118.1937, color: ['rgba(77,162,255,0.9)', 'rgba(77,162,255,0.05)'], status: 'healthy', label: 'Shanghai → Long Beach' },
  { startLat: 19.0760, startLng: 72.8777,  endLat: 51.9225, endLng: 4.4791,    color: ['rgba(77,162,255,0.9)', 'rgba(77,162,255,0.05)'], status: 'healthy', label: 'Mumbai → Rotterdam' },
  { startLat: 22.5431, startLng: 114.0579, endLat: 47.6062, endLng: -122.3321, color: ['rgba(255,184,77,0.9)', 'rgba(255,184,77,0.05)'], status: 'warning', label: 'Shenzhen → Seattle' },
  { startLat: 25.2048, startLng: 55.2708,  endLat: 53.5511, endLng: 9.9937,    color: ['rgba(255,92,108,0.9)', 'rgba(255,92,108,0.05)'], status: 'critical', label: 'Dubai → Hamburg' },
  { startLat: 1.3521,  startLng: 103.8198, endLat: -33.8688,endLng: 151.2093,  color: ['rgba(77,162,255,0.9)', 'rgba(77,162,255,0.05)'], status: 'healthy', label: 'Singapore → Sydney' },
  { startLat: 35.6762, startLng: 139.6503, endLat: 34.0522, endLng: -118.2437, color: ['rgba(77,162,255,0.9)', 'rgba(77,162,255,0.05)'], status: 'healthy', label: 'Tokyo → Los Angeles' },
  { startLat: 51.5074, startLng: -0.1278,  endLat: 1.3521,  endLng: 103.8198,  color: ['rgba(255,184,77,0.9)', 'rgba(255,184,77,0.05)'], status: 'warning', label: 'London → Singapore' },
  { startLat: 45.4215, startLng: -75.6972, endLat: 40.7128, endLng: -74.0060,  color: ['rgba(77,162,255,0.9)', 'rgba(77,162,255,0.05)'], status: 'healthy', label: 'Ottawa → New York' },
]

const RING_DATA = ARC_DATA.flatMap(arc => [
  { lat: arc.startLat, lng: arc.startLng, color: arc.color[0], maxR: 2.2, propagationSpeed: 2.5, repeatPeriod: 1000 },
  { lat: arc.endLat,   lng: arc.endLng,   color: arc.color[0], maxR: 2.2, propagationSpeed: 2.5, repeatPeriod: 1000 },
])

// ─── Component ───────────────────────────────────────────────────────────────

export default function TradeGlobe() {
  const globeRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [polygonData, setPolygonData] = useState<any[]>([])
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Load country polygons for tactial continent visibility
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(data => setPolygonData(data.features))
      .catch(() => setPolygonData([]))
  }, [])

  // ResizeObserver — more reliable than window resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    setDimensions({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Post-init — controls + Three.js lighting + custom globe material
  const handleGlobeReady = useCallback(() => {
    const g = globeRef.current
    if (!g) return

    // Operational controls
    const controls = g.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    controls.enableZoom = false
    controls.enableDamping = true
    controls.dampingFactor = 0.06

    // Starting camera position
    g.pointOfView({ lat: 22, lng: 82, altitude: 2.0 })

    // Custom globe material is now passed as a prop below.

    // Supplement with better scene lighting
    const scene = g.scene() as THREE.Scene
    const ambient = new THREE.AmbientLight(0x223355, 1.4)
    scene.add(ambient)
    const dirLight = new THREE.DirectionalLight(0x4499cc, 0.7)
    dirLight.position.set(4, 2, 4)
    scene.add(dirLight)
  }, [isDark])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] cursor-move">
      {dimensions.width > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          onGlobeReady={handleGlobeReady}
          backgroundColor="rgba(0,0,0,0)"

          // ── Base globe material ───
          globeMaterial={
            new THREE.MeshPhongMaterial({
              color: new THREE.Color(isDark ? 0x030c1a : 0x0c1e3d),
              emissive: new THREE.Color(isDark ? 0x040f22 : 0x0a1930),
              emissiveIntensity: 0.08,
              shininess: 18,
            })
          }
          globeImageUrl=""
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"

          // ── Atmospheric rim glow ──────────────────────────────────────────
          atmosphereColor={isDark ? '#3BA7B8' : '#4DA2FF'}
          atmosphereAltitude={0.20}
          showAtmosphere={true}

          // ── Continent polygons — desaturated slate-blue tactical styling ──
          polygonsData={polygonData}
          polygonCapColor={() => isDark ? 'rgba(40,70,115,0.70)' : 'rgba(55,95,155,0.58)'}
          polygonSideColor={() => isDark ? 'rgba(28,50,88,0.28)' : 'rgba(40,70,120,0.22)'}
          polygonStrokeColor={() => isDark ? 'rgba(77,162,255,0.16)' : 'rgba(37,99,235,0.14)'}
          polygonAltitude={0.006}

          // ── Animated trade route arcs ─────────────────────────────────────
          arcsData={ARC_DATA}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor="color"
          arcDashLength={0.45}
          arcDashGap={0.15}
          arcDashAnimateTime={2200}
          arcAltitudeAutoScale={0.38}
          arcStroke={1.5}

          // ── Active port rings ─────────────────────────────────────────────
          ringsData={RING_DATA}
          ringColor="color"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
        />
      )}
    </div>
  )
}
