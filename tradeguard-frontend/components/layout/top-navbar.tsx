"use client"

import { Search, Bell } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { ConnectionStatus } from "@/components/ui/connection-status"
import { Toaster } from "sonner"
import { useLiveStore } from "@/stores/live-store"

export function TopNavbar() {
  const alerts = useLiveStore((s) => s.alerts)
  const criticalCount = alerts.filter((a) => a.severity === "critical").length

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-4 lg:px-5">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1 size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-150" />
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              type="search"
              placeholder="Search shipments, regulations..."
              className="w-full bg-muted/40 hover:bg-muted/60 focus:bg-muted/80 transition-colors pl-9 border-border/60 rounded-md text-sm h-8 shadow-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Live SSE Connection Status */}
          <ConnectionStatus />

          <div className="w-px h-4 bg-border" />

          <ModeToggle />

          {/* Alert bell */}
          <button
            className="relative size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-150"
            aria-label={criticalCount > 0 ? `${criticalCount} critical alerts` : "Alerts"}
          >
            <Bell className="h-4 w-4" />
            {criticalCount > 0 && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-critical" />
            )}
          </button>

          {/* User badge */}
          <div className="size-7 rounded-full bg-intelligence/20 border border-intelligence/30 flex items-center justify-center text-intelligence font-semibold text-[10px] cursor-pointer hover:bg-intelligence/30 transition-colors duration-150">
            TG
          </div>
        </div>
      </header>
    </>
  )
}
