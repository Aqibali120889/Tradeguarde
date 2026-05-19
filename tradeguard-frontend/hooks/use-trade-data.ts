import { useQuery } from "@tanstack/react-query"
import { fetchAlerts } from "@/lib/api/alerts"
import { fetchAgentActivity } from "@/lib/api/agents"
import { fetchAnalytics, fetchShipments } from "@/lib/api/analytics"
import { fetchRegulations } from "@/lib/api/regulations"

// ─── Query Keys ───────────────────────────────────────────────────────────────
// Centralised so we can easily invalidate related queries together.

export const QUERY_KEYS = {
  alerts: ['alerts'] as const,
  agentActivity: ['agent-activity'] as const,
  analytics: ['analytics'] as const,
  shipments: ['shipments'] as const,
  regulations: ['regulations'] as const,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Active risk alerts stream — polled every 30s */
export function useAlerts() {
  return useQuery({
    queryKey: QUERY_KEYS.alerts,
    queryFn: fetchAlerts,
    refetchInterval: 30_000,
  })
}

/** Autonomous agent activity feed — polled every 20s for live feel */
export function useAgentActivity() {
  return useQuery({
    queryKey: QUERY_KEYS.agentActivity,
    queryFn: fetchAgentActivity,
    refetchInterval: 20_000,
  })
}

/** KPI analytics metrics */
export function useTradeAnalytics() {
  return useQuery({
    queryKey: QUERY_KEYS.analytics,
    queryFn: fetchAnalytics,
    staleTime: 60_000,
  })
}

/** Shipment intelligence data table */
export function useShipments() {
  return useQuery({
    queryKey: QUERY_KEYS.shipments,
    queryFn: fetchShipments,
    staleTime: 45_000,
  })
}

/** Regulatory intelligence */
export function useRegulations() {
  return useQuery({
    queryKey: QUERY_KEYS.regulations,
    queryFn: fetchRegulations,
    staleTime: 5 * 60_000, // Regulations change infrequently
  })
}
