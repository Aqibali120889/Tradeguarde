"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Brain, X, Send, Shield, Loader2,
  TrendingUp, AlertTriangle, CheckCircle2, Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLiveStore } from "@/stores/live-store"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ─── Types ────────────────────────────────────────────────────────────────────

interface CopilotResponse {
  answer:       string
  reasoning:    string
  confidence:   number
  sources:      string[]
  action_items: string[]
}

interface Message {
  id:        string
  role:      "operator" | "copilot"
  content:   string | CopilotResponse
  timestamp: string
  loading?:  boolean
}

// ─── Quick commands ───────────────────────────────────────────────────────────

const QUICK_COMMANDS = [
  "What routes are currently impacted?",
  "Which suppliers show sanctions risk?",
  "Explain the latest rerouting decision",
  "What is the estimated financial impact?",
  "What autonomous actions were taken?",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? "text-success" : pct >= 60 ? "text-warning" : "text-critical"
  return (
    <span className={cn("text-[10px] font-mono font-bold", color)}>
      {pct}% confidence
    </span>
  )
}

function CopilotMessage({ msg }: { msg: Message }) {
  if (msg.role === "operator") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-primary/15 border border-primary/25 rounded-lg rounded-tr-sm px-3 py-2">
          <p className="text-xs text-foreground font-medium">{msg.content as string}</p>
          <span className="text-[9px] text-muted-foreground font-mono mt-1 block">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    )
  }

  if (msg.loading) {
    return (
      <div className="flex items-start gap-2">
        <div className="size-6 rounded-md bg-intelligence/20 border border-intelligence/30 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="size-3.5 text-intelligence animate-pulse" />
        </div>
        <div className="flex-1 bg-muted/30 border border-border/50 rounded-lg rounded-tl-sm p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="size-3 animate-spin text-intelligence" />
            <span className="text-[11px] text-muted-foreground">Analyzing operational context...</span>
          </div>
          {[70, 50, 85].map((w, i) => (
            <div key={i} className={`h-2 rounded bg-muted/50 animate-pulse`} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const res = msg.content as CopilotResponse
  return (
    <div className="flex items-start gap-2">
      <div className="size-6 rounded-md bg-intelligence/20 border border-intelligence/30 flex items-center justify-center shrink-0 mt-0.5">
        <Brain className="size-3.5 text-intelligence" />
      </div>
      <div className="flex-1 bg-muted/20 border border-border/50 rounded-lg rounded-tl-sm p-3 space-y-3">
        {/* Answer */}
        <p className="text-xs text-foreground leading-relaxed">{res.answer}</p>

        {/* Reasoning */}
        {res.reasoning && (
          <div className="flex items-start gap-1.5 pt-1 border-t border-border/30">
            <Zap className="size-3 text-intelligence shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">{res.reasoning}</p>
          </div>
        )}

        {/* Action items */}
        {res.action_items?.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/30">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Actions</span>
            {res.action_items.map((a, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="size-3 text-success shrink-0 mt-0.5" />
                <span className="text-[11px] text-foreground/80">{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between pt-1">
          <ConfidenceBadge value={res.confidence} />
          <span className="text-[9px] text-muted-foreground font-mono">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function OpsCopilot() {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRef             = useRef<HTMLDivElement>(null)

  // Pull live context — use separate primitive selectors to prevent
  // useSyncExternalStore from seeing a new object reference every render.
  const kpi         = useLiveStore((s) => s.kpi)
  const storeEvents = useLiveStore((s) => s.events)
  const storeAlerts = useLiveStore((s) => s.alerts)

  const liveContext = useMemo(() => ({
    kpi,
    events: storeEvents.slice(0, 8),
    alerts: storeAlerts.slice(0, 4),
  }), [kpi, storeEvents, storeAlerts])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendQuery = useCallback(async (q: string) => {
    if (!q.trim() || loading) return

    const userMsg: Message = {
      id: crypto.randomUUID(), role: "operator",
      content: q, timestamp: new Date().toISOString(),
    }
    const loadingMsg: Message = {
      id: crypto.randomUUID(), role: "copilot",
      content: "" as any, timestamp: new Date().toISOString(), loading: true,
    }
    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setQuery("")
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, context: liveContext }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CopilotResponse = await res.json()

      setMessages((prev) => [
        ...prev.filter((m) => !m.loading),
        { id: crypto.randomUUID(), role: "copilot", content: data, timestamp: new Date().toISOString() },
      ])
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => !m.loading),
        {
          id: crypto.randomUUID(), role: "copilot",
          content: {
            answer: "Unable to reach the agent system. Ensure the TradeGuard backend is running.",
            reasoning: "Connection to /api/copilot/ask failed.",
            confidence: 0,
            sources: [],
            action_items: ["Start backend: uvicorn apps.api.main:app --reload"],
          } as CopilotResponse,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [loading, liveContext])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuery(query) }
  }

  const alertCount = useLiveStore((s) => s.alerts.filter((a) => a.severity === "critical").length)

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-card border border-border rounded-full px-4 py-3 shadow-xl hover:shadow-2xl hover:border-intelligence/50 transition-all duration-200 group"
          >
            <div className="relative">
              <Brain className="size-5 text-intelligence" />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-critical animate-pulse ring-2 ring-background" />
              )}
            </div>
            <span className="text-sm font-semibold text-foreground group-hover:text-intelligence transition-colors">
              Ops Copilot
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Copilot panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-6 right-6 z-50 w-[420px] max-h-[80vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b operational-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-intelligence/15 border border-intelligence/25">
                  <Brain className="size-4 text-intelligence" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Operations Copilot</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {liveContext.events.length} events in context
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Live context strip */}
            <div className="flex items-center gap-3 px-4 py-2 bg-background/60 border-b operational-border shrink-0">
              {[
                { icon: Shield, label: `${liveContext.kpi.compliance_score.toFixed(1)}%`, sub: "Compliance" },
                { icon: AlertTriangle, label: String(liveContext.kpi.active_risks), sub: "Risks" },
                { icon: TrendingUp, label: liveContext.kpi.autonomous_actions.toLocaleString(), sub: "Actions" },
              ].map((item) => (
                <div key={item.sub} className="flex items-center gap-1.5">
                  <item.icon className="size-3 text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-foreground">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground">{item.sub}</span>
                </div>
              ))}
            </div>

            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground text-center py-2">
                    Ask about live trade intelligence, agent actions, or risk analysis.
                  </p>
                  <div className="space-y-1.5">
                    {QUICK_COMMANDS.map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => sendQuery(cmd)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 border border-border/50 hover:border-intelligence/30 text-[11px] text-muted-foreground hover:text-foreground transition-all"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <CopilotMessage key={msg.id} msg={msg} />
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t operational-border shrink-0 bg-background/60">
              <div className="flex items-end gap-2">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Query operational intelligence..."
                  rows={1}
                  className="flex-1 resize-none bg-muted/40 border border-border/60 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-intelligence/50 focus:ring-1 focus:ring-intelligence/20 font-mono transition-all min-h-[38px] max-h-[100px]"
                />
                <button
                  onClick={() => sendQuery(query)}
                  disabled={!query.trim() || loading}
                  className="p-2.5 rounded-lg bg-intelligence hover:bg-intelligence/90 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shrink-0"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1.5 text-right font-mono">
                Enter to send · Shift+Enter for newline
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
