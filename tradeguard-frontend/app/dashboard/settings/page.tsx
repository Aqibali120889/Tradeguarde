import { Settings } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Platform configuration, API integrations, and notification preferences.</p>
      </div>
      <div className="dashboard-panel p-12 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <Settings className="size-8 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Settings — Coming in Phase 2</p>
        <p className="text-xs text-muted-foreground/60">API keys, notification rules, team management, and compliance thresholds.</p>
      </div>
    </div>
  )
}
