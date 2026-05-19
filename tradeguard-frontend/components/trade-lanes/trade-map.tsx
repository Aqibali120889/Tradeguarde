"use client"

import { useState, useCallback, useRef } from 'react'
import Map, { Source, Layer, Popup, type MapRef, type LayerProps } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

// ─── Mock Trade Route Data ────────────────────────────────────────────────────
const ROUTES = [
  { id: 'r1', coords: [[121.47, 31.23], [-118.24, 34.05]], status: 'healthy',  label: 'Shanghai → Los Angeles',   value: '$2.1B/mo', risk: 'Low' },
  { id: 'r2', coords: [[72.88, 19.08],  [4.48, 51.92]],   status: 'healthy',  label: 'Mumbai → Rotterdam',        value: '$890M/mo', risk: 'Low' },
  { id: 'r3', coords: [[114.06, 22.54], [-122.33, 47.61]], status: 'warning',  label: 'Shenzhen → Seattle',        value: '$1.4B/mo', risk: 'Medium' },
  { id: 'r4', coords: [[55.27, 25.20],  [9.99, 53.55]],   status: 'critical', label: 'Dubai → Hamburg',           value: '$670M/mo', risk: 'High' },
  { id: 'r5', coords: [[103.82, 1.35],  [151.21, -33.87]], status: 'healthy', label: 'Singapore → Sydney',        value: '$430M/mo', risk: 'Low' },
  { id: 'r6', coords: [[139.65, 35.68], [-118.24, 34.05]], status: 'healthy', label: 'Tokyo → Los Angeles',       value: '$980M/mo', risk: 'Low' },
  { id: 'r7', coords: [[-0.13, 51.51],  [103.82, 1.35]],  status: 'warning',  label: 'London → Singapore',        value: '$540M/mo', risk: 'Medium' },
  { id: 'r8', coords: [[121.47, 31.23], [4.48, 51.92]],   status: 'critical', label: 'Shanghai → Rotterdam',      value: '$1.8B/mo', risk: 'High' },
]

const PORTS = [
  { id: 'p1', lng: 121.47, lat: 31.23,  name: 'Shanghai',     traffic: 'Very High', status: 'healthy' },
  { id: 'p2', lng: -118.24,lat: 34.05,  name: 'Los Angeles',  traffic: 'High',      status: 'healthy' },
  { id: 'p3', lng: 4.48,   lat: 51.92,  name: 'Rotterdam',    traffic: 'High',      status: 'healthy' },
  { id: 'p4', lng: 55.27,  lat: 25.20,  name: 'Dubai (Jebel Ali)', traffic: 'High', status: 'warning' },
  { id: 'p5', lng: 103.82, lat: 1.35,   name: 'Singapore',    traffic: 'Very High', status: 'congested' },
  { id: 'p6', lng: 72.88,  lat: 19.08,  name: 'Mumbai (JNPT)', traffic: 'Medium',  status: 'healthy' },
  { id: 'p7', lng: 139.65, lat: 35.68,  name: 'Tokyo',        traffic: 'High',      status: 'healthy' },
  { id: 'p8', lng: 114.06, lat: 22.54,  name: 'Shenzhen',     traffic: 'Very High', status: 'healthy' },
]

// Build GeoJSON
const routeGeoJSON = {
  type: 'FeatureCollection' as const,
  features: ROUTES.map(r => ({
    type: 'Feature' as const,
    id: r.id,
    properties: { status: r.status, label: r.label, value: r.value, risk: r.risk },
    geometry: { type: 'LineString' as const, coordinates: r.coords },
  })),
}

const portGeoJSON = {
  type: 'FeatureCollection' as const,
  features: PORTS.map(p => ({
    type: 'Feature' as const,
    id: p.id,
    properties: { name: p.name, traffic: p.traffic, status: p.status },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  })),
}

// Layer styles
const healthyLineLayer: LayerProps = {
  id: 'routes-healthy',
  type: 'line',
  filter: ['==', ['get', 'status'], 'healthy'],
  paint: { 'line-color': '#4DA2FF', 'line-width': 1.8, 'line-opacity': 0.75, 'line-dasharray': [3, 2] },
}
const warningLineLayer: LayerProps = {
  id: 'routes-warning',
  type: 'line',
  filter: ['==', ['get', 'status'], 'warning'],
  paint: { 'line-color': '#FFB84D', 'line-width': 2.0, 'line-opacity': 0.85, 'line-dasharray': [2, 2] },
}
const criticalLineLayer: LayerProps = {
  id: 'routes-critical',
  type: 'line',
  filter: ['==', ['get', 'status'], 'critical'],
  paint: { 'line-color': '#FF5C6C', 'line-width': 2.2, 'line-opacity': 0.90, 'line-dasharray': [1, 2] },
}
const portCircleLayer: LayerProps = {
  id: 'ports-circle',
  type: 'circle',
  paint: {
    'circle-radius': 5,
    'circle-color': ['match', ['get', 'status'], 'warning', '#FFB84D', 'congested', '#FF5C6C', '#4DA2FF'],
    'circle-opacity': 0.9,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#071019',
  },
}
const portGlowLayer: LayerProps = {
  id: 'ports-glow',
  type: 'circle',
  paint: {
    'circle-radius': 12,
    'circle-color': ['match', ['get', 'status'], 'warning', '#FFB84D', 'congested', '#FF5C6C', '#4DA2FF'],
    'circle-opacity': 0.12,
    'circle-stroke-width': 0,
  },
}

// ─── Component ────────────────────────────────────────────────────────────────
interface PopupInfo {
  lng: number
  lat: number
  label: string
  value: string
  risk: string
  status: string
}

export default function TradeMap() {
  const mapRef = useRef<MapRef>(null)
  const [popup, setPopup] = useState<PopupInfo | null>(null)

  const onMapClick = useCallback((e: any) => {
    const features = e.features
    if (!features?.length) { setPopup(null); return }
    const f = features[0]
    if (['routes-healthy','routes-warning','routes-critical'].includes(f.layer.id)) {
      const coords = f.geometry.coordinates
      const mid = coords[Math.floor(coords.length / 2)]
      setPopup({ lng: mid[0], lat: mid[1], ...f.properties })
    }
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#020813] text-muted-foreground flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest opacity-60">Mapbox Token Required</p>
        <p className="text-xs opacity-40">Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local</p>
      </div>
    )
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{ longitude: 30, latitude: 20, zoom: 1.8 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      interactiveLayerIds={['routes-healthy', 'routes-warning', 'routes-critical']}
      onClick={onMapClick}
      cursor="crosshair"
    >
      <Source id="trade-routes" type="geojson" data={routeGeoJSON}>
        <Layer {...healthyLineLayer} />
        <Layer {...warningLineLayer} />
        <Layer {...criticalLineLayer} />
      </Source>
      <Source id="ports" type="geojson" data={portGeoJSON}>
        <Layer {...portGlowLayer} />
        <Layer {...portCircleLayer} />
      </Source>

      {popup && (
        <Popup longitude={popup.lng} latitude={popup.lat} closeOnClick={false} onClose={() => setPopup(null)}
          className="mapbox-popup-operational" anchor="bottom">
          <div className="bg-card border border-border rounded-lg p-3 shadow-xl min-w-[200px]">
            <p className="text-xs font-bold text-foreground mb-1">{popup.label}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Volume</span>
                <span className="text-foreground font-medium">{popup.value}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Risk Level</span>
                <span className={popup.risk === 'High' ? 'text-critical font-bold' : popup.risk === 'Medium' ? 'text-warning font-bold' : 'text-success font-bold'}>{popup.risk}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Status</span>
                <span className="text-foreground capitalize">{popup.status}</span>
              </div>
            </div>
          </div>
        </Popup>
      )}
    </Map>
  )
}
