"use client"

import { useObservabilityStore } from "@/stores/observability-store"
import ReactJson from "react-json-view"
import { motion } from "framer-motion"

export function SourceInspector() {
  const selected = useObservabilityStore((s) => s.selectedSourceEvent)
  // We'll store selectedSourceEvent via a separate selector (to be added to the store later)
  if (!selected) {
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
      <ReactJson src={selected.payload} name={selected.id} collapsed={2} enableClipboard={false} displayDataTypes={false} style={{ background: "transparent", fontSize: "0.85rem" }} />
    </motion.div>
  )
}
