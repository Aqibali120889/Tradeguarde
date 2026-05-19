import { AgentActivity } from './types'

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MOCK_AGENT_ACTIVITY: AgentActivity[] = [
  {
    id: 'AGT-001',
    agentName: 'Watchdog Agent',
    agentType: 'watchdog',
    action: 'Detected new EU tariff regulation on aluminum imports — 15% increase effective Q3.',
    status: 'warning',
    timestamp: new Date(Date.now() - 1.5 * 60 * 1000).toISOString(),
  },
  {
    id: 'AGT-002',
    agentName: 'Impact Analyzer',
    agentType: 'impact_analyzer',
    action: 'Identified 18 affected SKUs across 4 active shipments valued at $2.4M.',
    status: 'warning',
    timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    metadata: { affectedSkus: 18, affectedShipments: 4, estimatedImpact: 2400000 },
  },
  {
    id: 'AGT-003',
    agentName: 'Sanctions Engine',
    agentType: 'sanctions_engine',
    action: 'Supplier "Jinhai Materials Ltd" matched OFAC SDN List — shipment hold initiated.',
    status: 'critical',
    timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    metadata: { matchConfidence: 98, listName: 'OFAC SDN' },
  },
  {
    id: 'AGT-004',
    agentName: 'Action Planner',
    agentType: 'action_planner',
    action: 'Proposed reroute via Rotterdam port to avoid Red Sea disruption corridor.',
    status: 'info',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    metadata: { alternativeRoute: 'Rotterdam', estimatedDelay: '2 days', costDelta: '+$12,000' },
  },
  {
    id: 'AGT-005',
    agentName: 'Execution Agent',
    agentType: 'execution',
    action: 'Updated shipment SHP-84921 routing in TMS. New ETA: June 4, 2026.',
    status: 'success',
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    metadata: { shipmentId: 'SHP-84921', newETA: '2026-06-04' },
  },
  {
    id: 'AGT-006',
    agentName: 'Communication Agent',
    agentType: 'communication',
    action: 'Generated supplier advisory for 3 partners on new tariff compliance requirements.',
    status: 'success',
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    metadata: { recipientCount: 3, advisoryType: 'Tariff Compliance' },
  },
  {
    id: 'AGT-007',
    agentName: 'Watchdog Agent',
    agentType: 'watchdog',
    action: 'Monitoring 1,204 active global trade lanes. No anomalies in last 30 minutes.',
    status: 'success',
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    metadata: { monitoredLanes: 1204 },
  },
  {
    id: 'AGT-008',
    agentName: 'Impact Analyzer',
    agentType: 'impact_analyzer',
    action: 'Semiconductor export control analysis complete — 6 shipments require license review.',
    status: 'warning',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    metadata: { shipmentsRequiringReview: 6 },
  },
]

// ─── API Function ─────────────────────────────────────────────────────────────

export async function fetchAgentActivity(): Promise<AgentActivity[]> {
  await new Promise(r => setTimeout(r, 350))
  return MOCK_AGENT_ACTIVITY
}
