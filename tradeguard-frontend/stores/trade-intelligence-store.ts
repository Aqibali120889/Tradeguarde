import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import { LiveEvent } from "./live-store"

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
  shipmentCount: number
  activeTariffs: string[]
  riskScore: number
  reason?: string
  agent?: string
  lastUpdated: string
}

export interface IntelligencePort {
  id: string
  name: string
  lat: number
  lng: number
  status: "operational" | "congested" | "sanctioned" | "restricted"
  activeShipments: number
  riskLevel: number
  delays: string
}

export interface SanctionZone {
  id: string
  country: string
  reason: string
  coordinates: number[] // flat array of [lng, lat, lng, lat...]
  severity: "warning" | "critical"
  timestamp: string
}

export interface Shockwave {
  id: string
  lat: number
  lng: number
  color: string
  timestamp: number // creation time for animation fading
}

interface TradeIntelligenceStore {
  routes: Record<string, TradeRoute>
  ports: Record<string, IntelligencePort>
  sanctions: Record<string, SanctionZone>
  shockwaves: Shockwave[]
  selectedSourceEvent: LiveEvent | null

  // Actions
  processEvent: (event: LiveEvent) => void
  setSelectedSourceEvent: (event: LiveEvent | null) => void
  addShockwave: (shockwave: Omit<Shockwave, "id" | "timestamp">) => void
  cleanupShockwaves: () => void
}

// Helpers for coordinates
const getCoordinatesForLocation = (loc: string): [number, number] => {
  const map: Record<string, [number, number]> = {
    "Shanghai": [121.4737, 31.2304],
    "Rotterdam": [4.4791, 51.9225],
    "Los Angeles": [-118.1937, 33.7701],
    "Singapore": [103.8198, 1.3521],
    "Hamburg": [9.9937, 53.5511],
    "Dubai": [55.2708, 25.2048],
    "Mumbai": [72.8777, 19.076],
    "New York": [-74.006, 40.7128],
    "Shenzhen": [114.0579, 22.5431],
    "Seattle": [-122.3321, 47.6062],
    "Tokyo": [139.6503, 35.6762],
    "London": [-0.1278, 51.5074],
    "China": [104.1954, 35.8617], // Center for pulses
    "Russia": [105.3188, 61.524],
    "Iran": [53.688, 32.4279],
  }
  return map[loc] || [0, 0] // Default to 0,0 if unknown
}

const getSanctionPolygon = (country: string): number[] => {
  if (country === "Russia") {
    return [27, 47, 60, 47, 60, 72, 27, 72, 27, 47] // rough bbox
  }
  if (country === "Iran") {
    return [44, 25, 63, 25, 63, 38, 44, 38, 44, 25]
  }
  if (country === "China") {
    return [73, 18, 135, 18, 135, 53, 73, 53, 73, 18]
  }
  return []
}

export const useTradeIntelligenceStore = create<TradeIntelligenceStore>()(
  subscribeWithSelector((set, get) => ({
    routes: {},
    ports: {},
    sanctions: {},
    shockwaves: [],
    selectedSourceEvent: null,

    setSelectedSourceEvent: (event) => set({ selectedSourceEvent: event }),

    addShockwave: (sw) => set((state) => ({
      shockwaves: [...state.shockwaves, { ...sw, id: crypto.randomUUID(), timestamp: Date.now() }]
    })),

    cleanupShockwaves: () => set((state) => {
      const now = Date.now()
      return {
        shockwaves: state.shockwaves.filter(s => now - s.timestamp < 3000)
      }
    }),

    processEvent: (event) => set((state) => {
      const { payload, event_type, agent, severity, affected_routes, country } = event as any
      const newRoutes = { ...state.routes }
      const newPorts = { ...state.ports }
      const newSanctions = { ...state.sanctions }
      const newShockwaves = [...state.shockwaves]

      let locForShockwave: [number, number] | null = null
      let shockwaveColor = severity === "critical" ? "#FF4D6D" : severity === "warning" ? "#FFB020" : "#00C2FF"

      // Process Ports if any origin/dest are seen
      const ensurePort = (name: string) => {
        if (!newPorts[name]) {
          const [lng, lat] = getCoordinatesForLocation(name)
          if (lng !== 0 || lat !== 0) {
            newPorts[name] = {
              id: `port-${name}`,
              name,
              lat,
              lng,
              status: "operational",
              activeShipments: Math.floor(Math.random() * 50) + 10,
              riskLevel: 10,
              delays: "None",
            }
          }
        }
      }

      // Process Sanctions
      if (event_type === "sanction_detected" || (event.title && event.title.toLowerCase().includes("sanction"))) {
        const c = country || payload?.country
        if (c) {
          const poly = getSanctionPolygon(c)
          if (poly.length > 0) {
            newSanctions[c] = {
              id: `sanction-${c}`,
              country: c,
              reason: event.summary,
              coordinates: poly,
              severity: "critical",
              timestamp: event.timestamp,
            }
            locForShockwave = getCoordinatesForLocation(c)
            shockwaveColor = "#FF4D6D"
          }
        }
      }

      // Process Reroutes
      if (event_type === "route_rerouted" || payload?.new_route || (event.title && event.title.toLowerCase().includes("reroute"))) {
        const origin = payload?.origin || payload?.original_route?.origin
        const dest = payload?.destination || payload?.original_route?.destination
        const via = payload?.via || payload?.new_route?.via

        if (origin && dest && via) {
          const oldRouteId = `${origin}-${dest}`
          if (newRoutes[oldRouteId]) {
            newRoutes[oldRouteId].severity = "warning"
          }
          
          ensurePort(origin)
          ensurePort(via)
          ensurePort(dest)

          const [oLng, oLat] = getCoordinatesForLocation(origin)
          const [vLng, vLat] = getCoordinatesForLocation(via)
          const [dLng, dLat] = getCoordinatesForLocation(dest)

          // Leg 1
          newRoutes[`${origin}-${via}`] = {
            id: `${origin}-${via}`,
            label: `${origin} → ${via}`,
            origin,
            destination: via,
            originLng: oLng, originLat: oLat,
            destLng: vLng, destLat: vLat,
            severity: "rerouted",
            shipmentCount: payload?.affected_shipments || 10,
            activeTariffs: [],
            riskScore: 20,
            agent,
            reason: event.summary,
            lastUpdated: event.timestamp,
          }

          // Leg 2
          newRoutes[`${via}-${dest}`] = {
            id: `${via}-${dest}`,
            label: `${via} → ${dest}`,
            origin: via,
            destination: dest,
            originLng: vLng, originLat: vLat,
            destLng: dLng, destLat: dLat,
            severity: "rerouted",
            shipmentCount: payload?.affected_shipments || 10,
            activeTariffs: [],
            riskScore: 20,
            agent,
            reason: event.summary,
            lastUpdated: event.timestamp,
          }
          
          locForShockwave = [vLng, vLat]
          shockwaveColor = "#A78BFA"
        }
      }

      // Process Tariff / Disruptions on Routes
      if (affected_routes && Array.isArray(affected_routes)) {
        affected_routes.forEach(r => {
          ensurePort(r.origin)
          ensurePort(r.destination)
          const routeId = `${r.origin}-${r.destination}`
          const [oLng, oLat] = getCoordinatesForLocation(r.origin)
          const [dLng, dLat] = getCoordinatesForLocation(r.destination)
          
          newRoutes[routeId] = {
            id: routeId,
            label: `${r.origin} → ${r.destination}`,
            origin: r.origin,
            destination: r.destination,
            originLng: oLng, originLat: oLat,
            destLng: dLng, destLat: dLat,
            severity: severity === "critical" ? "critical" : severity === "warning" ? "warning" : "healthy",
            shipmentCount: event.payload?.affected_shipments as number || 14,
            activeTariffs: event.payload?.affected_hs_codes as string[] || [],
            riskScore: event.payload?.risk_score as number || 85,
            agent,
            reason: event.summary,
            lastUpdated: event.timestamp,
          }

          if (!locForShockwave) {
             locForShockwave = [oLng, oLat]
          }
          
          if (severity === "critical") {
            newPorts[r.origin].status = "restricted"
            newPorts[r.origin].riskLevel = 90
          }
        })
      }

      if (locForShockwave) {
        newShockwaves.push({
          id: crypto.randomUUID(),
          lng: locForShockwave[0],
          lat: locForShockwave[1],
          color: shockwaveColor,
          timestamp: Date.now()
        })
      }

      return { routes: newRoutes, ports: newPorts, sanctions: newSanctions, shockwaves: newShockwaves }
    })
  }))
)
