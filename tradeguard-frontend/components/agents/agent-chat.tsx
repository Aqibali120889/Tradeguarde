"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentChat } from "@/hooks/useAgentChat"
import { useOrchestrationStore, type AgentChatMessage, type QueryState } from "@/stores/orchestration-store"

// ─── Enterprise color palette ──────────────────────────────────────────────

const AGENT_COLOR: Record<string, string> = {
  watchdog:      "#60A5FA",
  impact:        "#A78BFA",
  planner:       "#A78BFA",
  execution:     "#4ADE80",
  governance:    "#FBBF24",
  communication: "#60A5FA",
}

const AGENT_BG: Record<string, string> = {
  watchdog:      "rgba(59,130,246,0.07)",
  impact:        "rgba(167,139,250,0.07)",
  planner:       "rgba(167,139,250,0.07)",
  execution:     "rgba(34,197,94,0.07)",
  governance:    "rgba(245,158,11,0.07)",
  communication: "rgba(59,130,246,0.07)",
}

// ─── Typing indicator ──────────────────────────────────────────────────────

function TypingIndicator({ agentIcon, agentName, color }: {
  agentIcon: string
  agentName: string
  color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-start gap-3 px-4 py-2"
    >
      <div
        className="shrink-0 size-8 rounded-full flex items-center justify-center text-base"
        style={{ background: `${color}14`, border: `1px solid ${color}35` }}
      >
        {agentIcon}
      </div>
      <div>
        <p className="text-[10px] font-mono mb-1 font-medium" style={{ color }}>{agentName}</p>
        <div
          className="flex items-center gap-1 px-3 py-2 rounded-xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full"
              style={{ background: color }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Reasoning trace (expandable) ─────────────────────────────────────────

function ReasoningTrace({ tools, confidence, workflowId, eventSource }: {
  tools: string[]
  confidence: number
  workflowId?: string
  eventSource?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isSimulated = eventSource?.includes("simulated")

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[9px] font-mono text-[#475569] hover:text-[#64748B] transition-colors"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        reasoning trace
        {isSimulated && (
          <span
            className="px-1 py-0.5 rounded text-[7px]"
            style={{ background: "rgba(245,158,11,0.12)", color: "#FBBF24", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            SIMULATED
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 rounded-lg overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="px-3 py-2.5 space-y-1.5">
              {/* Tools called */}
              {tools.length > 0 && (
                <div>
                  <p className="text-[8px] font-mono text-[#475569] mb-1 tracking-wider">TOOLS CALLED</p>
                  <div className="flex flex-wrap gap-1">
                    {tools.map(t => (
                      <span
                        key={t}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(59,130,246,0.08)", color: "#60A5FA", border: "1px solid rgba(59,130,246,0.2)" }}
                      >
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Confidence bar */}
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-mono text-[#475569] tracking-wider">CONFIDENCE</span>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <motion.div
                    className="h-full rounded-full bg-[#A78BFA]"
                    initial={{ width: 0 }}
                    animate={{ width: `${confidence * 100}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
                <span className="text-[8px] font-mono text-[#A78BFA] tabular-nums">
                  {Math.round(confidence * 100)}%
                </span>
              </div>

              {/* Source lineage */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {workflowId && (
                  <div className="flex items-center gap-1">
                    <span className="text-[7px] font-mono text-[#475569]">WORKFLOW</span>
                    <span className="text-[7px] font-mono text-[#4ADE80]">{workflowId}</span>
                  </div>
                )}
                {eventSource && (
                  <div className="flex items-center gap-1">
                    <span className="text-[7px] font-mono text-[#475569]">SOURCE</span>
                    <span className="text-[7px] font-mono text-[#60A5FA]">{eventSource}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Single message bubble ─────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AgentChatMessage }) {
  const isUser = msg.role === "user"
  const color = msg.agent ? (AGENT_COLOR[msg.agent] ?? "#60A5FA") : "#F1F5F9"
  const bg = msg.agent ? (AGENT_BG[msg.agent] ?? "rgba(255,255,255,0.05)") : "rgba(59,130,246,0.1)"
  const timeStr = new Date(msg.timestamp).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  })

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end px-4 py-1.5"
      >
        <div
          className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5"
          style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}
        >
          <p className="text-[13px] text-[#F1F5F9] leading-relaxed">{msg.content}</p>
          <p className="text-[9px] font-mono text-[#475569] mt-1 text-right tabular-nums">{timeStr}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-3 px-4 py-1.5"
    >
      {/* Agent avatar */}
      <div
        className="shrink-0 size-8 rounded-full flex items-center justify-center text-base mt-1"
        style={{ background: `${color}14`, border: `1px solid ${color}35` }}
      >
        {msg.agentIcon || "🤖"}
      </div>

      {/* Message body */}
      <div className="flex-1 min-w-0 max-w-[82%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono font-semibold" style={{ color }}>{msg.agentName}</span>
          <span className="text-[9px] font-mono text-[#475569] tabular-nums">{timeStr}</span>
          {msg.isStreaming && (
            <span className="size-1.5 rounded-full animate-pulse" style={{ background: color }} />
          )}
        </div>

        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3"
          style={{ background: bg, border: `1px solid ${color}20` }}
        >
          {/* Message text — must be readable */}
          <p className="text-[13px] text-[#CBD5E1] leading-relaxed">{msg.content}</p>

          {/* Reasoning trace */}
          {(msg.toolsCalled?.length || msg.workflowId) && (
            <ReasoningTrace
              tools={msg.toolsCalled || []}
              confidence={msg.confidence || 0.85}
              workflowId={msg.workflowId}
              eventSource={msg.eventSource}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Suggestion chips ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Why did shipment TG-482 reroute?",
  "Analyze China tariff impact",
  "Investigate supplier sanctions",
  "Show active compliance risks",
  "Explain latest OFAC update",
  "What shipments are affected?",
]

function SuggestionChips({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {SUGGESTIONS.map(s => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-all duration-150 hover:brightness-110"
          style={{
            background: "rgba(59,130,246,0.07)",
            border: "1px solid rgba(59,130,246,0.2)",
            color: "#60A5FA",
          }}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

// ─── Processing progress bar ───────────────────────────────────────────────

function QueryProgress({ currentQuery }: { currentQuery: QueryState | null }) {
  if (!currentQuery || currentQuery.status === "done") return null
  const AGENTS = ["watchdog", "impact", "planner", "execution", "governance"]

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-4 py-2"
    >
      <div
        className="rounded-xl px-3 py-2.5"
        style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="size-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
          <span className="text-[10px] font-mono text-[#60A5FA] font-semibold">
            ORCHESTRATING MULTI-AGENT RESPONSE
          </span>
        </div>
        <div className="flex items-center gap-1">
          {AGENTS.map((a, i) => {
            const isActive = currentQuery.agentsActive.includes(a)
            const color = AGENT_COLOR[a] || "#60A5FA"
            return (
              <React.Fragment key={a}>
                <motion.div
                  className="size-2 rounded-full"
                  style={{ background: isActive ? color : "rgba(255,255,255,0.08)" }}
                  animate={isActive ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
                {i < AGENTS.length - 1 && (
                  <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main AgentChat ────────────────────────────────────────────────────────

export default function AgentChat() {
  const { sendQuery, isProcessing } = useAgentChat()
  const messages = useOrchestrationStore(s => s.messages)
  const currentQuery = useOrchestrationStore(s => s.currentQuery)

  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, currentQuery])

  const handleSubmit = async (query: string) => {
    const q = query.trim()
    if (!q || isProcessing) return
    setInput("")
    await sendQuery(q)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--surface-base)" }}>
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="size-2 rounded-full bg-[#4ADE80] animate-pulse" />
          <div>
            <p className="text-[11px] font-semibold text-[#E2E8F0] tracking-wide">
              Agent Intelligence Chat
            </p>
            <p className="text-[9px] font-mono text-[#475569] mt-0.5">
              Multi-agent real-time orchestration
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: "rgba(34,197,94,0.1)", color: "#4ADE80", border: "1px solid rgba(34,197,94,0.22)" }}
            >
              6 AGENTS ONLINE
            </span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 space-y-0.5">
        <AnimatePresence initial={false}>
          {/* Empty state */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center"
            >
              <div
                className="size-12 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)" }}
              >
                🧠
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#CBD5E1] mb-1">
                  Agents are standing by
                </p>
                <p className="text-[10px] text-[#64748B] font-mono leading-relaxed">
                  Ask about shipments, regulations, sanctions,<br />trade routes, or compliance risks.
                </p>
              </div>
            </motion.div>
          )}

          {/* Messages */}
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Query progress */}
          {isProcessing && currentQuery && (
            <QueryProgress key="progress" currentQuery={currentQuery} />
          )}
        </AnimatePresence>
      </div>

      {/* Suggestion chips — only shown when no messages */}
      {messages.length === 0 && !isProcessing && (
        <SuggestionChips onSelect={(q) => { setInput(q); handleSubmit(q) }} />
      )}

      {/* Input bar */}
      <div
        className="shrink-0 px-3 pb-3 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <form
          onSubmit={e => { e.preventDefault(); handleSubmit(input) }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder="Ask agents anything… e.g. Why did TG-482 reroute?"
            className="flex-1 text-[12px] text-[#CBD5E1] outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "8px 14px",
              caretColor: "#3B82F6",
            }}
          />
          <button
            type="submit"
            disabled={isProcessing || !input.trim()}
            className="shrink-0 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all duration-150 disabled:opacity-40"
            style={{
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#60A5FA",
            }}
          >
            {isProcessing ? "···" : "Ask"}
          </button>
        </form>
      </div>
    </div>
  )
}
