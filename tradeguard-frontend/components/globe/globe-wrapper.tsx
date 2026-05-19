"use client"

import dynamic from "next/dynamic"

const TradeGlobe = dynamic(() => import("./cesium-globe"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 min-h-[400px]">
      <div className="size-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <span className="font-mono text-xs tracking-widest uppercase opacity-70">Initializing Geospatial Engine...</span>
    </div>
  )
})

export function GlobeWrapper() {
  return <TradeGlobe />
}
