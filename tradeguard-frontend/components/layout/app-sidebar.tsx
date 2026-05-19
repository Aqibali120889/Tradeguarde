"use client"

import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Globe, ShieldAlert,
  Activity, BarChart3, Settings, Cpu,
} from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar"
import Link from "next/link"

const NAV_ITEMS = [
  { title: "Dashboard",      url: "/dashboard",             icon: LayoutDashboard },
  { title: "Trade Lanes",    url: "/dashboard/trade-lanes", icon: Globe },
  { title: "Regulations",    url: "/dashboard/regulations", icon: ShieldAlert },
  { title: "Agent Command",  url: "/dashboard/agents",      icon: Cpu },
  { title: "Analytics",      url: "/dashboard/analytics",   icon: BarChart3 },
]

const BOTTOM_ITEMS = [
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  const isActive = (url: string) =>
    url === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(url)

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      {/* Brand header */}
      <SidebarHeader className="h-14 flex items-center justify-center border-b border-sidebar-border px-4 py-0 shrink-0">
        <div className="flex w-full items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-intelligence shadow-sm">
            <Globe className="size-3.5 text-white" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden min-w-0">
            <span className="block font-semibold text-sm text-sidebar-foreground tracking-tight leading-none truncate">
              TradeGuard
            </span>
            <span className="block text-[9px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">
              AI Operations
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Main nav */}
      <SidebarContent className="py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.15em] px-3 mb-1">
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.url)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={active}
                      className={
                        "h-9 rounded-md transition-colors duration-150 " +
                        (active
                          ? "bg-intelligence/10 text-intelligence hover:bg-intelligence/15"
                          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent")
                      }
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4 shrink-0" />
                        <span className="font-medium text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — correct placement: sibling of SidebarContent, NOT nested inside it */}
      <SidebarFooter className="border-t border-sidebar-border pb-2 shrink-0">
        <SidebarMenu className="gap-0.5">
          {BOTTOM_ITEMS.map((item) => {
            const active = isActive(item.url)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={active}
                  className={
                    "h-9 rounded-md transition-colors duration-150 " +
                    (active
                      ? "bg-intelligence/10 text-intelligence"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent")
                  }
                >
                  <Link href={item.url}>
                    <item.icon className="size-4 shrink-0" />
                    <span className="font-medium text-sm">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
