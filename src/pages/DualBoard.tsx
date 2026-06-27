import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Truck, ClipboardCheck, Maximize2 } from "lucide-react";
import RequestDelivery from "./RequestDelivery";
import TrackerPO from "./TrackerPO";

const MIN_PCT = 20;
const MAX_PCT = 80;

export default function DualBoard() {
  const navigate = useNavigate();
  const [topPct, setTopPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setTopPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, []);

  const onMouseUp = () => { dragging.current = false; };

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
    setTopPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={containerRef}
        className="flex flex-col h-[calc(100vh-4rem)] select-none"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Panel atas — Request Delivery */}
        <div style={{ height: `${topPct}%` }} className="min-h-0 overflow-hidden flex flex-col">
          <RequestDelivery compact />
        </div>

        {/* Divider — drag untuk resize */}
        <div
          className="group flex items-center justify-center shrink-0 cursor-row-resize z-10 relative"
          style={{ height: "10px" }}
          onMouseDown={onMouseDown}
          onTouchMove={onTouchMove}
        >
          {/* Line */}
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-px bg-border group-hover:bg-primary/40 transition-colors" />
          </div>
          {/* Handle chip */}
          <div className="relative z-10 flex items-center gap-3 bg-background border border-border rounded-full px-3 py-1 shadow-sm group-hover:border-primary/40 group-hover:shadow-md transition-all">
            {/* Quick preset buttons */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => navigate("/request-delivery")}
                >
                  <Truck className="h-3 w-3" />
                  <Maximize2 className="h-2.5 w-2.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Buka Request Delivery penuh</p></TooltipContent>
            </Tooltip>

            <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
              {[["30/70", 30], ["50/50", 50], ["70/30", 70]].map(([label, val]) => (
                <button
                  key={label}
                  onClick={() => setTopPct(val as number)}
                  className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="w-px h-3 bg-border" />

            {/* Drag hint dots */}
            <div className="flex flex-col gap-0.5 pointer-events-none">
              <div className="flex gap-0.5">
                {[0,1,2,3,4].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50" />)}
              </div>
              <div className="flex gap-0.5">
                {[0,1,2,3,4].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50" />)}
              </div>
            </div>

            <div className="w-px h-3 bg-border" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => navigate("/tracker-po")}
                >
                  <ClipboardCheck className="h-3 w-3" />
                  <Maximize2 className="h-2.5 w-2.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Buka Tracker PO penuh</p></TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Panel bawah — Tracker PO */}
        <div style={{ height: `${100 - topPct}%` }} className="min-h-0 overflow-hidden flex flex-col">
          <TrackerPO compact />
        </div>
      </div>
    </TooltipProvider>
  );
}
