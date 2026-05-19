import { Alert } from './types'

// ─── Mock Data ───────────────────────────────────────────────────────────────
// Replace with `apiGet<Alert[]>('/alerts')` when backend is ready.

export const MOCK_ALERTS: Alert[] = [
  {
    id: 'ALT-001',
    title: 'EU Aluminum Tariff Regulation',
    description: 'EU enacted 15% tariff increase on aluminum imports from APAC region.',
    severity: 'warning',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    region: 'EU',
    resolved: false,
  },
  {
    id: 'ALT-002',
    title: 'Suez Canal Route Anomaly',
    description: 'Vessel MSC Isabella deviating 140nm from planned Suez Canal corridor.',
    severity: 'critical',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    region: 'Red Sea',
    shipmentId: 'SHP-84921',
    resolved: false,
  },
  {
    id: 'ALT-003',
    title: 'Compliance Check Cleared',
    description: 'Shipment #49281 passed full regulatory compliance scan.',
    severity: 'success',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    shipmentId: 'SHP-49281',
    resolved: true,
  },
  {
    id: 'ALT-004',
    title: 'Semiconductor Export Controls',
    description: 'US BIS announced expanded export control requirements for advanced chips.',
    severity: 'warning',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    region: 'US',
    resolved: false,
  },
  {
    id: 'ALT-005',
    title: 'Restricted Supplier Flagged',
    description: 'Supplier entity "Jinhai Materials Ltd" matched OFAC sanctions list.',
    severity: 'critical',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    region: 'APAC',
    resolved: false,
  },
]

// ─── API Function ─────────────────────────────────────────────────────────────
// Ready to swap mock → real: `return apiGet<Alert[]>('/alerts')`

export async function fetchAlerts(): Promise<Alert[]> {
  // Simulated network latency
  await new Promise(r => setTimeout(r, 400))
  return MOCK_ALERTS
}
