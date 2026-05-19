import { BarChart3 } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">Enterprise trade analytics and operational intelligence reporting.</p>
      </div>
      <div className="dashboard-panel p-12 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <BarChart3 className="size-8 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Analytics Module — Coming in Phase 2</p>
        <p className="text-xs text-muted-foreground/60">Recharts-powered operational dashboards, KPI trend analysis, and export reporting.</p>
      </div>
    </div>
  )
}
