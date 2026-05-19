import { KPIGrid } from "@/components/dashboard/kpi-cards"
import { AIActivityFeed } from "@/components/dashboard/ai-activity-feed"
import { Globe, Activity, Zap } from "lucide-react"
import { GlobeWrapper } from "@/components/globe/globe-wrapper"
import LiveTradeTable from "@/components/dashboard/live-trade-table"

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Global Overview</h1>
        <p className="text-muted-foreground mt-2 text-sm">Autonomous trade intelligence — data derived from live agent event stream.</p>
      </div>

      {/* KPI Metrics Grid — sourced from realtime-kpi-store */}
      <KPIGrid />
      
      {/* Globe + AI Feed dual-column section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="dashboard-panel lg:col-span-4 min-h-[450px]">
          <div className="flex flex-col space-y-1.5 p-6 border-b operational-border bg-background/50 z-10 relative backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Globe className="size-5 text-intelligence" />
              <h3 className="font-semibold leading-none tracking-tight text-lg">Global Trade Lanes</h3>
            </div>
            <p className="text-sm text-muted-foreground pt-1">Real-time geospatial intelligence — agent-synchronized.</p>
          </div>
          <div className="flex-1 relative bg-[#020813] dark:bg-[#020813] overflow-hidden">
             <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(2,8,19,0.8)] z-10"></div>
             <GlobeWrapper />
          </div>
        </div>

        <div className="dashboard-panel lg:col-span-3 min-h-[450px] flex flex-col">
          <div className="flex flex-col space-y-1.5 p-6 border-b operational-border shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-monitoring" />
                <h3 className="font-semibold leading-none tracking-tight text-lg">Agent Activity</h3>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-success/10 border border-success/20">
                 <span className="live-indicator">
                    <span className="live-indicator-ping bg-success"></span>
                    <span className="live-indicator-dot bg-success"></span>
                 </span>
                 <span className="text-[10px] font-bold text-success uppercase tracking-widest">Live</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground pt-1">Autonomous agent event stream from SSE.</p>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <AIActivityFeed />
          </div>
        </div>
      </div>

      {/* Live Trade Intelligence — sourced from agent execution feed */}
      <div className="dashboard-panel p-6">
        <div className="flex flex-col space-y-1.5 mb-4">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-intelligence" />
            <h3 className="font-semibold leading-none tracking-tight text-lg">Live Agent Execution Feed</h3>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            Real-time shipment actions executed by autonomous agents — source-traced per event.
          </p>
        </div>
        <LiveTradeTable />
      </div>
    </div>
  )
}
