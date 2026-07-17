import React, { useState } from "react";
import { FlaskConical, Loader2, RefreshCw, CheckSquare, Square } from "lucide-react";
import { format, isPast } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  useTrackerKalibrasi,
  COLUMN_DEFS,
  COLUMN_CHECKLISTS,
  KalibrasiV2Card,
  KalibrasiV2Column,
  KalibrasiV2Checklist,
} from "@/hooks/useTrackerKalibrasi";
import TrackerKalibrasiCardDetail from "@/components/tracker-kalibrasi/TrackerKalibrasiCardDetail";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function totalValue(card: KalibrasiV2Card): number {
  return (card.instruments ?? []).reduce((sum, i) => sum + (i.unit_price ?? 0), 0);
}

// ─── kanban card ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
  card: KalibrasiV2Card;
  columnId: KalibrasiV2Column;
  checklists: KalibrasiV2Checklist[];
  canToggle: boolean;
  onToggle: (receiptId: string, key: string) => void;
  onClickCard: (id: string) => void;
}

function KanbanCard({
  card,
  columnId,
  checklists,
  canToggle,
  onToggle,
  onClickCard,
}: KanbanCardProps) {
  const items = COLUMN_CHECKLISTS[columnId] ?? [];
  const checkedCount = items.filter((item) =>
    checklists.some((c) => c.checklist_key === item.key && c.is_checked),
  ).length;
  const allDone = items.length > 0 && checkedCount === items.length;

  const isOverdue =
    card.target_completion_date &&
    isPast(new Date(card.target_completion_date + "T23:59:59"));

  const instCount = card.instruments?.length ?? 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm flex flex-col gap-0 overflow-hidden",
        "hover:shadow-md transition-shadow",
        allDone && "ring-2 ring-primary/40",
      )}
    >
      {/* Card header — clickable */}
      <button
        className="text-left px-3 pt-3 pb-2 hover:bg-muted/30 transition-colors"
        onClick={() => onClickCard(card.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-primary">
            {card.receipt_number}
          </span>
          {card.spk_number && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
              {card.spk_number}
            </span>
          )}
        </div>

        <p className="text-sm font-medium mt-1 truncate">
          {card.customer?.name ?? "-"}
        </p>

        <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
          <span>
            {instCount} alat · {formatRupiah(totalValue(card))}
          </span>
          {card.target_completion_date && (
            <span className={cn(isOverdue && columnId !== "selesai" && "text-destructive font-medium")}>
              {format(new Date(card.target_completion_date + "T00:00:00"), "d MMM", { locale: idLocale })}
            </span>
          )}
        </div>
      </button>

      {/* Checklists */}
      {items.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
          {items.map((item) => {
            const checked = checklists.some(
              (c) => c.checklist_key === item.key && c.is_checked,
            );
            return (
              <button
                key={item.key}
                disabled={!canToggle}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(card.id, item.key);
                }}
                className={cn(
                  "flex items-center gap-2 w-full text-left text-xs rounded transition-colors",
                  canToggle
                    ? "hover:text-foreground cursor-pointer"
                    : "cursor-default",
                  checked ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {checked ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                ) : (
                  <Square className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className={cn(checked && "line-through opacity-60")}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Progress bar */}
          {items.length > 0 && (
            <div className="mt-2">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(checkedCount / items.length) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                {checkedCount}/{items.length}
              </p>
            </div>
          )}
        </div>
      )}

      {/* "Siap pindah" badge */}
      {allDone && columnId !== "selesai" && (
        <div className="px-3 pb-2 pt-1 bg-primary/5">
          <span className="text-[10px] text-primary font-medium">
            ✓ Siap pindah ke kolom berikutnya
          </span>
        </div>
      )}
    </div>
  );
}

// ─── column ──────────────────────────────────────────────────────────────────

interface ColumnProps {
  colDef: (typeof COLUMN_DEFS)[number];
  cards: KalibrasiV2Card[];
  checklists: Record<string, KalibrasiV2Checklist[]>;
  canToggle: boolean;
  onToggle: (receiptId: string, key: string) => void;
  onClickCard: (id: string) => void;
}

function KanbanColumn({
  colDef,
  cards,
  checklists,
  canToggle,
  onToggle,
  onClickCard,
}: ColumnProps) {
  return (
    <div className="flex flex-col w-72 flex-none">
      {/* Column header */}
      <div className="rounded-xl border bg-card mb-2 overflow-hidden">
        <div className={cn("h-1.5 w-full", colDef.color)} />
        <div className="px-3 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{colDef.label}</p>
            <p className="text-xs text-muted-foreground">{colDef.desc}</p>
          </div>
          <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">
            {cards.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto pb-4 pr-0.5">
        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 h-20 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Kosong</p>
          </div>
        ) : (
          cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              columnId={colDef.id}
              checklists={checklists[card.id] || []}
              canToggle={canToggle}
              onToggle={onToggle}
              onClickCard={onClickCard}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function TrackerKalibrasi() {
  const {
    loading,
    checklists,
    canToggle,
    getColumnCards,
    toggleChecklist,
    refetch,
  } = useTrackerKalibrasi();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totalCards = COLUMN_DEFS.reduce(
    (sum, col) => sum + getColumnCards(col.id).length,
    0,
  );

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Tracker Kalibrasi</h1>
          {!loading && (
            <span className="text-sm text-muted-foreground">
              ({totalCards} aktif)
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* Kanban board */
        <div className="flex gap-4 flex-1 overflow-x-auto overflow-y-hidden pb-2">
          {COLUMN_DEFS.map((col) => (
            <KanbanColumn
              key={col.id}
              colDef={col}
              cards={getColumnCards(col.id)}
              checklists={checklists}
              canToggle={canToggle}
              onToggle={toggleChecklist}
              onClickCard={setSelectedId}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <TrackerKalibrasiCardDetail
          receiptId={selectedId}
          checklists={checklists[selectedId] ?? []}
          canToggle={canToggle}
          onToggle={toggleChecklist}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
