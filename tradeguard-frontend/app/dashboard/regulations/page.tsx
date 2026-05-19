"use client"

import { motion } from "framer-motion"
import {
  ShieldAlert, Brain, Globe, AlertTriangle, CheckCircle2,
  TrendingUp, FileText, Clock
} from "lucide-react"

// ─── Mock Data ────────────────────────────────────────────────────────────────
const AI_INSIGHTS = [
  { id: 1, text: "TradeGuard detected elevated compliance exposure across EU industrial imports — 6 shipments require immediate classification review.", icon: Brain, severity: "warning" },
  { id: 2, text: "Autonomous rerouting recommendations may reduce projected logistics cost exposure by 12% based on current sanctions mapping.", icon: TrendingUp, severity: "success" },
  { id: 3, text: "3 suppliers show increasing OFAC match probability. Human verification recommended within 48 hours.", icon: ShieldAlert, severity: "critical" },
]

const ALERTS = [
  { id: "REG-041", title: "EU CBAM Phase 2 Update", region: "European Union", category: "Carbon Border Adjustment", severity: "warning", date: "2026-05-16", sectors: ["Steel", "Aluminum", "Cement"], summary: "Phase 2 expands carbon border adjustment to 12 additional industrial sectors effective Q3 2026." },
  { id: "REG-BIS-018", title: "US Advanced Chip Export Controls", region: "United States", category: "Export Controls", severity: "critical", date: "2026-05-14", sectors: ["Semiconductors", "AI Hardware"], summary: "BIS expands restrictions on advanced AI chips and semiconductor manufacturing equipment to restricted destinations." },
  { id: "REG-OFAC-022", title: "OFAC SDN List Revision", region: "Global", category: "Sanctions", severity: "critical", date: "2026-05-12", sectors: ["Finance", "Metals", "Technology"], summary: "OFAC added 14 new entities across 5 countries to the Specially Designated Nationals list." },
  { id: "REG-WTO-007", title: "WTO Steel Trade Escalation", region: "Global", category: "Trade Dispute", severity: "warning", date: "2026-05-10", sectors: ["Steel", "Manufacturing"], summary: "WTO dispute settlement panel convened for US–EU steel tariff escalation case." },
  { id: "REG-CN-031", title: "China Rare Earth Export Notice", region: "China", category: "Export Restrictions", severity: "critical", date: "2026-05-08", sectors: ["Rare Earths", "Electronics", "Defense"], summary: "China announces new licensing requirements for export of 7 critical rare earth materials." },
]

const COUNTRY_RISKS = [
  { country: "Russia",      risk: "Critical", tariff: "High",   sanctions: "Active",  logistics: "Blocked",  recommendation: "Avoid — Full sanctions exposure" },
  { country: "Iran",        risk: "Critical", tariff: "High",   sanctions: "Active",  logistics: "Blocked",  recommendation: "Prohibited — OFAC primary sanctions" },
  { country: "China",       risk: "High",     tariff: "High",   sanctions: "Watch",   logistics: "Moderate", recommendation: "Heightened review required" },
  { country: "UAE",         risk: "Medium",   tariff: "Low",    sanctions: "Watch",   logistics: "Normal",   recommendation: "Monitor re-export risk" },
  { country: "India",       risk: "Low",      tariff: "Medium", sanctions: "None",    logistics: "Normal",   recommendation: "Proceed with standard compliance" },
  { country: "Germany",     risk: "Low",      tariff: "Low",    sanctions: "None",    logistics: "Normal",   recommendation: "No action required" },
  { country: "Singapore",   risk: "Low",      tariff: "Low",    sanctions: "None",    logistics: "Normal",   recommendation: "Strategic routing hub — favorable" },
]

const POLICY_TIMELINE = [
  { date: "Jul 1, 2026",  title: "EU CBAM Phase 2 Live",             type: "warning" },
  { date: "Jun 15, 2026", title: "US BIS Chip Controls Effective",    type: "critical" },
  { date: "Aug 1, 2026",  title: "UAE Re-export Restrictions Active", type: "warning" },
  { date: "Sep 1, 2026",  title: "WTO Review Panel Report Due",       type: "info" },
]

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-critical bg-critical/10 border-critical/25",
  warning:  "text-warning bg-warning/10 border-warning/25",
  info:     "text-intelligence bg-intelligence/10 border-intelligence/25",
  success:  "text-success bg-success/10 border-success/25",
}
const RISK_STYLES: Record<string, string> = {
  Critical: "text-critical font-bold",
  High:     "text-warning font-bold",
  Medium:   "text-intelligence",
  Low:      "text-success",
}

export default function RegulationsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Regulations</h1>
          <p className="text-muted-foreground mt-1 text-sm">AI-powered global regulatory intelligence and sanctions monitoring.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-critical/10 border border-critical/25">
          <span className="size-2 rounded-full bg-critical animate-pulse" />
          <span className="text-xs font-semibold text-critical">3 Critical Alerts</span>
        </div>
      </div>

      {/* AI Intelligence Insights */}
      <div className="grid gap-3 md:grid-cols-3">
        {AI_INSIGHTS.map((insight, i) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, ease: "easeOut" }}
            className={`enterprise-card p-4 border ${SEVERITY_STYLES[insight.severity]}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <insight.icon className="size-4 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider">AI Intelligence</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/90">{insight.text}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        {/* Regulatory Alerts Feed */}
        <div className="dashboard-panel lg:col-span-4">
          <div className="p-5 border-b operational-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-critical" />
              <h2 className="font-semibold text-lg">Regulatory Alerts</h2>
              <span className="ml-auto text-[11px] text-muted-foreground font-mono">{ALERTS.length} alerts</span>
            </div>
          </div>
          <div className="divide-y operational-border overflow-y-auto">
            {ALERTS.map((alert, i) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.06 }}
                className="p-5 hover:bg-muted/20 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{alert.title}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_STYLES[alert.severity]}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    {alert.date}
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Globe className="size-3" />{alert.region}</span>
                  <span className="flex items-center gap-1"><FileText className="size-3" />{alert.category}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{alert.summary}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {alert.sectors.map(s => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 text-[10px] text-muted-foreground">{s}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Policy Timeline */}
          <div className="enterprise-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="size-4 text-intelligence" />
              <h3 className="font-semibold">Global Policy Timeline</h3>
            </div>
            <div className="relative pl-4 border-l-2 border-border/40 space-y-4">
              {POLICY_TIMELINE.map((event, i) => (
                <div key={i} className="relative">
                  <div className={`absolute -left-[1.4rem] top-0.5 size-3 rounded-full border-2 border-background ${event.type === 'critical' ? 'bg-critical' : event.type === 'warning' ? 'bg-warning' : 'bg-intelligence'}`} />
                  <p className="text-xs font-semibold text-foreground">{event.title}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{event.date}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Country Risk Matrix */}
          <div className="enterprise-card overflow-hidden">
            <div className="p-4 border-b operational-border flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              <h3 className="font-semibold">Country Risk Matrix</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b operational-border bg-muted/40">
                    {["Country","Risk","Tariff","Sanctions","Logistics"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y operational-border">
                  {COUNTRY_RISKS.map((c, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{c.country}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${RISK_STYLES[c.risk]}`}>{c.risk}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.tariff}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${c.sanctions === 'Active' ? 'text-critical font-semibold' : c.sanctions === 'Watch' ? 'text-warning' : 'text-muted-foreground'}`}>{c.sanctions}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${c.logistics === 'Blocked' ? 'text-critical' : c.logistics === 'Moderate' ? 'text-warning' : 'text-muted-foreground'}`}>{c.logistics}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
