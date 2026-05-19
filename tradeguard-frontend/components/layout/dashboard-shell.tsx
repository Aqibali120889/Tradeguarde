"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "./app-sidebar"
import { TopNavbar } from "./top-navbar"
import { OpsCopilot } from "@/components/copilot/ops-copilot"

// Pages that need 100% available space with no padding/max-width constraints
const FULLSCREEN_ROUTES = ["/dashboard/trade-lanes", "/dashboard/agents"]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullscreen = FULLSCREEN_ROUTES.includes(pathname)

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <div className="flex flex-1 flex-col min-h-screen overflow-hidden bg-secondary/30">
          <TopNavbar />
          {isFullscreen ? (
            // Fullscreen mode — no padding, no max-width, no scroll, fills all remaining space
            <main className="flex-1 overflow-hidden relative flex flex-col">
              {children}
            </main>
          ) : (
            // Standard mode — padded scrollable content area
            <main className="flex-1 overflow-y-auto p-6 md:p-8 relative">
              <div className="mx-auto w-full max-w-7xl">
                {children}
              </div>
            </main>
          )}
        </div>
        {/* Floating AI Operations Copilot — available on every page */}
        <OpsCopilot />
      </SidebarProvider>
    </TooltipProvider>
  )
}
