import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Truck, ClipboardCheck, Maximize2, Minimize2, LayoutRows, LayoutColumns } from "lucide-react";
import { cn } from "@/lib/utils";
import RequestDelivery from "./RequestDelivery";
import TrackerPO from "./TrackerPO";

const MIN_PCT = 20;
const MAX_PCT = 80;

type Direction = "vertical" | "horizontal"; // vertical = atas/bawah, horizontal = kiri/kanan

export default function DualBoard() {
  const navigate = useNavigate();
  const [splitPct, setSplitPct] = useState(50);
  const [direction, setDirection] = useState<Direction>(
    () => (localStorage.getItem("dual_board_direction") as Direction) || "vertical"
  );
  const [isFullView, setIsFullView] = useState(
    () => localStorage.getItem("dual_board_full_view") === "true"
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleSetFullView = (val: boolean) => {
    setIsFullView(val);
    localStorage.setItem("dual_board_full_view", String(val));
  };

  const handleSetDirection = (d: Direction) => {
    setDirection(d);
    localStorage.setItem("dual_board_direction", d);
    setSplitPct(50); // reset ke 50/50 saat ganti orientasi
  };

  // ─── Drag handlers ────────────────────────────────────────────────────────

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = direction === "vertical"
      ? ((e.clientY - rect.top) / rect.height) * 100
      : ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, [direction]);

  const onMouseUp = () => { dragging.current = false; };

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = direction === "vertical"
      ? ((touch.clientY - rect.top) / rect.height) * 100
      : ((touch.clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, [direction]);

  const isVertical = direction === "vertical";
  const pctA = Math.round(splitPct);
  const pctB = 100 - pctA;

  // ─── Divider chip shared controls ────────────────────────────────────────

  const chipControls = (
    <div
      className="relative z-10 flex items-center gap-2 bg-background border border-border rounded-full px-3 py-1 shadow-sm group-hover:border-primary/40 group-hover:shadow-md transition-all"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Buka panel A penuh */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            onClick={() => navigate("/request-delivery")}
          >
            <Truck className="h-3 w-3" />
            <Maximize2 className="h-2.5 w-2.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isVertical ? "top" : "right"}><p>Buka Request Delivery penuh</p></TooltipContent>
      </Tooltip>

      <div className="w-px h-3 bg-border" />

      {/* Preset ratio */}
      <div className="flex gap-0.5">
        {([["30/70", 30], ["50/50", 50], ["70/30", 70]] as [string, number][]).map(([label, val]) => (
          <button
            key={label}
            onClick={() => setSplitPct(val)}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded transition-colors",
              splitPct === val ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Persentase live */}
      <span className="text-[10px] font-mono text-primary font-semibold tabular-nums min-w-[52px] text-center">
        {pctA}% │ {pctB}%
      </span>

      <div className="w-px h-3 bg-border" />

      {/* Drag hint dots */}
      <div className={cn("flex gap-0.5 pointer-events-none", !isVertical && "flex-col")}>
        <div className={cn("flex gap-0.5", !isVertical && "flex-col")}>
          {[0,1,2,3,4].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40" />)}
        </div>
        <div className={cn("flex gap-0.5", !isVertical && "flex-col")}>
          {[0,1,2,3,4].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40" />)}
        </div>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Toggle orientasi */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center text-muted-foreground hover:text-primary transition-colors"
            onClick={() => handleSetDirection(isVertical ? "horizontal" : "vertical")}
          >
            {isVertical
              ? <LayoutColumns className="h-3.5 w-3.5" />
              : <LayoutRows className="h-3.5 w-3.5" />
            }
          </button>
        </TooltipTrigger>
        <TooltipContent side={isVertical ? "top" : "right"}>
          <p>{isVertical ? "Ganti ke Kiri / Kanan" : "Ganti ke Atas / Bawah"}</p>
        </TooltipContent>
      </Tooltip>

      {/* Full View */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center text-muted-foreground hover:text-primary transition-colors"
            onClick={() => handleSetFullView(!isFullView)}
          >
            {isFullView ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side={isVertical ? "top" : "right"}>
          <p>{isFullView ? "Keluar Full View" : "Full View"}</p>
        </TooltipContent>
      </Tooltip>

      <div className="w-px h-3 bg-border" />

      {/* Buka panel B penuh */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            onClick={() => navigate("/tracker-po")}
          >
            <ClipboardCheck className="h-3 w-3" />
            <Maximize2 className="h-2.5 w-2.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isVertical ? "top" : "right"}><p>Buka Tracker PO penuh</p></TooltipContent>
      </Tooltip>
    </div>
  );

  // ─── Divider ──────────────────────────────────────────────────────────────

  const divider = isVertical ? (
    // Horizontal divider (atas/bawah)
    <div
      className="group flex items-center justify-center shrink-0 cursor-row-resize z-10 relative"
      style={{ height: "14px" }}
      onMouseDown={onDividerMouseDown}
      onTouchMove={onTouchMove}
    >
      <div className="absolute inset-0 flex items-center">
        <div className="w-full h-px bg-border group-hover:bg-primary/40 transition-colors" />
      </div>
      {chipControls}
    </div>
  ) : (
    // Vertical divider (kiri/kanan)
    <div
      className="group flex items-center justify-center shrink-0 cursor-col-resize z-10 relative"
      style={{ width: "14px" }}
      onMouseDown={onDividerMouseDown}
      onTouchMove={onTouchMove}
    >
      <div className="absolute inset-0 flex justify-center">
        <div className="h-full w-px bg-border group-hover:bg-primary/40 transition-colors" />
      </div>
      {chipControls}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={containerRef}
        className={cn(
          "select-none bg-background",
          isVertical ? "flex flex-col" : "flex flex-row",
          isFullView ? "fixed inset-0 z-50" : "h-[calc(100vh-4rem)]"
        )}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Panel A — Request Delivery */}
        <div
          className="min-h-0 min-w-0 overflow-hidden flex flex-col"
          style={isVertical ? { height: `${splitPct}%` } : { width: `${splitPct}%` }}
        >
          <RequestDelivery compact />
        </div>

        {divider}

        {/* Panel B — Tracker PO */}
        <div
          className="min-h-0 min-w-0 overflow-hidden flex flex-col flex-1"
        >
          <TrackerPO compact />
        </div>
      </div>
    </TooltipProvider>
  );
}
