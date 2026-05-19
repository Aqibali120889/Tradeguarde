"use client"

import { useObservabilityStore } from "@/stores/observability-store"
import { motion } from "framer-motion"

export function SourceInspector() {
  const selectedId = useObservabilityStore((s) => s.selectedSourceEventId)
  const traces = useObservabilityStore((s) => s.traces)

  // Find the selected step's output payload across all traces
  const selectedPayload = selectedId
    ? traces
        .flatMap((t) => t.steps)
        .find((st) => st.id === selectedId)?.output ?? null
    : null

  if (!selectedPayload) {
    return (
      <div className="text-muted-foreground text-sm italic">
        Select an event from the Live Event Stream to inspect its raw payload.
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg bg-[#101A2C] border border-[#2E3846] p-4 overflow-auto max-h-[400px]"
    >
      <h3 className="text-sm font-medium mb-2 text-intelligence">Raw Source Payload</h3>
      <pre
        className="text-[0.85rem] font-mono text-[#A0C8E8] whitespace-pre-wrap break-all leading-relaxed"
        style={{ background: "transparent" }}
      >
        {JSON.stringify(selectedPayload, null, 2)}
      </pre>
    </motion.div>
  )
}
