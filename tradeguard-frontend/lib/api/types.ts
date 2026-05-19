// ─── Base API Types ──────────────────────────────────────────────────────────

export type Severity = 'info' | 'warning' | 'critical' | 'success'

export interface APIResponse<T> {
  data: T
  status: number
  message?: string
}

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface Alert {
  id: string
  title: string
  description: string
  severity: Severity
  timestamp: string
  region?: string
  shipmentId?: string
  agentId?: string
  resolved: boolean
}

export interface Regulation {
  id: string
  title: string
  jurisdiction: string
  category: string
  effectiveDate: string
  impactLevel: Severity
  affectedHsCodes: string[]
  summary: string
  source: string
}

export interface AgentActivity {
  id: string
  agentName: string
  agentType: 'watchdog' | 'impact_analyzer' | 'sanctions_engine' | 'action_planner' | 'execution' | 'communication'
  action: string
  status: Severity
  timestamp: string
  metadata?: Record<string, string | number>
}

export interface TradeAnalytics {
  complianceScore: number
  complianceScoreTrend: number
  activeRisks: number
  activeRisksTrend: number
  affectedShipments: number
  affectedShipmentsTrend: number
  autonomousActions: number
  autonomousActionsTrend: number
  periodLabel: string
}

export interface Shipment {
  id: string
  origin: string
  destination: string
  value: string
  status: 'cleared' | 'flagged' | 'pending' | 'rerouted'
  agentAction: string
  timestamp: string
  riskScore: number
}
