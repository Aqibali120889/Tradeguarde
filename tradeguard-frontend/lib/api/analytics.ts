import { TradeAnalytics, Shipment } from './types'

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MOCK_ANALYTICS: TradeAnalytics = {
  complianceScore: 98.4,
  complianceScoreTrend: 1.2,
  activeRisks: 12,
  activeRisksTrend: -4,
  affectedShipments: 142,
  affectedShipmentsTrend: -12,
  autonomousActions: 8942,
  autonomousActionsTrend: 24,
  periodLabel: 'Last 30 days',
}

export const MOCK_SHIPMENTS: Shipment[] = [
  { id: 'SHP-84920', origin: 'Shanghai', destination: 'Rotterdam',   value: '$1.2M',  status: 'cleared',  agentAction: 'Automated Approval',     timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), riskScore: 4 },
  { id: 'SHP-84921', origin: 'Shenzhen', destination: 'Long Beach',  value: '$850K',  status: 'flagged',  agentAction: 'Manual Review Required',  timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), riskScore: 82 },
  { id: 'SHP-84922', origin: 'Mumbai',   destination: 'Hamburg',     value: '$320K',  status: 'cleared',  agentAction: 'Automated Approval',     timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), riskScore: 7 },
  { id: 'SHP-84923', origin: 'Dubai',    destination: 'Rotterdam',   value: '$2.1M',  status: 'rerouted', agentAction: 'Rerouted via Suez',       timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(), riskScore: 61 },
  { id: 'SHP-84924', origin: 'Tokyo',    destination: 'Los Angeles', value: '$680K',  status: 'pending',  agentAction: 'Awaiting Customs Review', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), riskScore: 29 },
]

// ─── API Functions ────────────────────────────────────────────────────────────

export async function fetchAnalytics(): Promise<TradeAnalytics> {
  await new Promise(r => setTimeout(r, 300))
  return MOCK_ANALYTICS
}

export async function fetchShipments(): Promise<Shipment[]> {
  await new Promise(r => setTimeout(r, 450))
  return MOCK_SHIPMENTS
}
