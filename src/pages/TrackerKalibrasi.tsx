import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Search, Loader2, ZoomIn, ZoomOut, RefreshCw, ExternalLink, CalendarDays, MapPin, User } from "lucide-react";
import { format, isPast, differenceInDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useTrackerKalibrasi,
  KALIBRASI_COLUMNS,
  KALIBRASI_COLUMN_CHECKLISTS,
  KALIBRASI_CHECKLIST_LABELS,
  KalibrasiCard,
  KalibrasiColumn,
} from "@/hooks/useTrackerKalibrasi";
import { useCalibrationItems } from "@/hooks/useSalesOrders";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(v || 0));
}

function formatDateID(d: string) {
  try { return format(new Date(d), "dd MMM yyyy", { locale: idLocale }); }
  catch { return d; }
}

function DeadlineBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const d = new Date(date);
  const daysLeft = differenceInDays(d, new Date());
  const past = isPast(d);
  return (
    <span className={cn(
      "text-xs font-medium",
      past ? "text-red-500" : daysLeft <= 7 ? "text-orange-500" : "text-muted-foreground"
    )}>
      {past ? `Terlambat ${Math.abs(daysLeft)} hr` : daysLeft === 0 ? "Hari ini!" : `${daysLeft} hr lagi`}
    </span>
  );
}

function KalibrasiKanbanCard({
  card,
  col,
  checklists,
  canToggle,
  onToggle,
  onClick,
  zoom,
}: {
  card: KalibrasiCard;
  col: KalibrasiColumn;
  checklists: import("@/hooks/useTrackerKalibrasi").KalibrasiChecklist[];
  canToggle: boolean;
  onToggle: (key: string) => void;
  onClick: () => void;
  zoom: number;
}) {
  const colChecklists = KALIBRASI_COLUMN_CHECKLISTS[col];
  const fontSize = Math.max(8, Math.round(zoom * 0.12));

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border bg-card rounded-lg overflow-hidden"
      style={{ fontSize }}
      onClick={onClick}
    >
      <div className="p-2.5 space-y-1.5">
        {/* SPK / SO number */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex flex-col gap-0.5 min-w-0">
            {card.spk_number ? (
              <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 text-[0.9em] truncate">
                {card.spk_number}
              </span>
            ) : (
              <span className="font-mono text-muted-foreground text-[0.9em] truncate">
                {card.sales_order_number}
              </span>
            )}
          </div>
          <Badge variant="secondary" className="text-[0.75em] shrink-0">
            <FlaskConical className="w-2.5 h-2.5 mr-0.5" />
            Kalibr.
          </Badge>
        </div>

        {/* Customer */}
        <p className="font-semibold text-[1em] truncate leading-tight">
          {card.customer?.name || "-"}
        </p>

        {/* Target completion */}
        {card.target_completion_date && (
          <div className="flex items-center gap-1 text-[0.85em]">
            <CalendarDays className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{formatDateID(card.target_completion_date)}</span>
            <DeadlineBadge date={card.target_completion_date} />
          </div>
        )}

        {/* Location */}
        {card.service_location && (
          <div className="flex items-center gap-1 text-[0.85em] text-muted-foreground truncate">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{card.service_location}</span>
          </div>
        )}

        {/* Grand total */}
        <p className="text-[0.85em] font-medium text-primary">{formatCurrency(card.grand_total)}</p>

        {/* Checklists */}
        {colChecklists.length > 0 && (
          <div
            className="border-t pt-1.5 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {colChecklists.map((key) => {
              const item = checklists.find((c) => c.checklist_key === key);
              const isChecked = !!item?.is_checked;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`${card.id}-${key}`}
                    checked={isChecked}
                    disabled={isChecked || !canToggle}
                    onCheckedChange={() => !isChecked && canToggle && onToggle(key)}
                    className="w-3 h-3"
                  />
                  <label
                    htmlFor={`${card.id}-${key}`}
                    className={cn(
                      "text-[0.85em] leading-tight cursor-pointer select-none",
                      isChecked ? "line-through text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {KALIBRASI_CHECKLIST_LABELS[key] || key}
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function CardDetailDialog({
  card,
  col,
  checklists,
  canToggle,
  onToggle,
  onClose,
}: {
  card: KalibrasiCard;
  col: KalibrasiColumn;
  checklists: import("@/hooks/useTrackerKalibrasi").KalibrasiChecklist[];
  canToggle: boolean;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { items: calibItems, loading: calibLoading } = useCalibrationItems(card.id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />
            {card.spk_number || card.sales_order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">No. SO</p>
              <p className="font-medium">{card.sales_order_number}</p>
            </div>
            {card.spk_number && (
              <div>
                <p className="text-muted-foreground text-xs">No. SPK</p>
                <p className="font-mono font-bold text-blue-700 dark:text-blue-300">{card.spk_number}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Customer</p>
              <p className="font-medium">{card.customer?.name || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Sales</p>
              <p className="font-medium">{card.sales_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Target Selesai</p>
              <div className="flex items-center gap-2">
                <p className="font-medium">{card.target_completion_date ? formatDateID(card.target_completion_date) : "-"}</p>
                <DeadlineBadge date={card.target_completion_date} />
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Lokasi Servis</p>
              <p className="font-medium">{card.service_location || "-"}</p>
            </div>
            {card.service_pic_name && (
              <div>
                <p className="text-muted-foreground text-xs">PIC Customer</p>
                <p className="font-medium">{card.service_pic_name}</p>
              </div>
            )}
            {card.service_pic_phone && (
              <div>
                <p className="text-muted-foreground text-xs">Telepon PIC</p>
                <p className="font-medium">{card.service_pic_phone}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Grand Total</p>
              <p className="font-semibold text-primary">{formatCurrency(card.grand_total)}</p>
            </div>
            {card.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Catatan</p>
                <p className="font-medium">{card.notes}</p>
              </div>
            )}
          </div>

          {/* Calibration instruments */}
          <div>
            <p className="text-sm font-semibold mb-2">Daftar Alat Kalibrasi</p>
            {calibLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : calibItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Tidak ada alat</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Nama Alat</TableHead>
                      <TableHead>Merk/Model</TableHead>
                      <TableHead>No. Seri</TableHead>
                      <TableHead>Range Ukur</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calibItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.item_number}</TableCell>
                        <TableCell className="font-medium">{item.instrument_name}</TableCell>
                        <TableCell>{item.brand_model || "-"}</TableCell>
                        <TableCell>{item.serial_number || "-"}</TableCell>
                        <TableCell>{item.measurement_range || "-"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(item.unit_price))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Checklists (all columns, read state) */}
          <div>
            <p className="text-sm font-semibold mb-2">Progress Checklist</p>
            <div className="space-y-2">
              {Object.entries(KALIBRASI_CHECKLIST_LABELS).map(([key, label]) => {
                const item = checklists.find((c) => c.checklist_key === key);
                const isChecked = !!item?.is_checked;
                const colKeys = KALIBRASI_COLUMN_CHECKLISTS[col];
                const isCurrentCol = colKeys.includes(key);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      checked={isChecked}
                      disabled={isChecked || !canToggle || !isCurrentCol}
                      onCheckedChange={() => !isChecked && canToggle && isCurrentCol && onToggle(key)}
                      className="w-4 h-4"
                    />
                    <span className={cn(
                      "text-sm",
                      isChecked ? "line-through text-muted-foreground" : isCurrentCol ? "font-medium" : "text-muted-foreground"
                    )}>
                      {label}
                    </span>
                    {item?.checked_at && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(item.checked_at), "dd MMM yyyy HH:mm", { locale: idLocale })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onClose(); navigate(`/sales-order?id=${card.id}`); }}
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Lihat SO
          </Button>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TrackerKalibrasi() {
  const {
    cards,
    checklists,
    loading,
    canToggleChecklist,
    getColumnCards,
    getCardColumn,
    toggleChecklist,
    refetch,
  } = useTrackerKalibrasi();

  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem("tracker_kal_zoom") || "80"));
  const [selectedCard, setSelectedCard] = useState<KalibrasiCard | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSetZoom = useCallback((v: number) => {
    const clamped = Math.min(130, Math.max(40, v));
    setZoom(clamped);
    localStorage.setItem("tracker_kal_zoom", String(clamped));
  }, []);

  const filterCard = useCallback((card: KalibrasiCard) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      card.sales_order_number.toLowerCase().includes(q) ||
      (card.spk_number || "").toLowerCase().includes(q) ||
      (card.customer?.name || "").toLowerCase().includes(q) ||
      (card.service_location || "").toLowerCase().includes(q)
    );
  }, [search]);

  const totalCards = cards.filter(filterCard).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 py-3 bg-background border-b flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Tracker Kalibrasi</h1>
            <p className="text-xs text-muted-foreground">Calibration Service Tracker</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari SPK / Customer..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {totalCards} order
          </span>
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ZoomOut className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" onClick={() => handleSetZoom(zoom - 5)} />
          <input
            type="range" min={40} max={130} step={5} value={zoom}
            onChange={(e) => handleSetZoom(Number(e.target.value))}
            className="w-20 accent-primary h-1"
            title={`Zoom: ${zoom}%`}
          />
          <ZoomIn className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" onClick={() => handleSetZoom(zoom + 5)} />
          <span className="text-[10px] text-muted-foreground w-7 tabular-nums">{zoom}%</span>
        </div>

        <Button variant="ghost" size="sm" onClick={refetch} className="shrink-0 h-8 w-8 p-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Board */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div
          className="flex gap-3 p-4 h-full"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left", width: `${10000 / zoom}%`, minHeight: `${10000 / zoom}%` }}
        >
          {KALIBRASI_COLUMNS.map((col) => {
            const colCards = getColumnCards(col.id).filter(filterCard);
            return (
              <div key={col.id} className="flex flex-col w-[260px] flex-shrink-0">
                {/* Column header */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-t-lg bg-muted/60 border border-b-0 border-border">
                  <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", col.color)} />
                  <span className="text-xs font-semibold text-foreground">{col.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
                    {colCards.length}
                  </Badge>
                </div>

                {/* Cards */}
                <div className="flex-1 border border-border rounded-b-lg bg-muted/20 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                  {colCards.length === 0 ? (
                    <div className="text-center py-6 text-[11px] text-muted-foreground/60">
                      Tidak ada order
                    </div>
                  ) : (
                    colCards.map((card) => (
                      <KalibrasiKanbanCard
                        key={card.id}
                        card={card}
                        col={col.id}
                        checklists={checklists[card.id] || []}
                        canToggle={canToggleChecklist}
                        onToggle={(key) => toggleChecklist(card.id, key)}
                        onClick={() => setSelectedCard(card)}
                        zoom={zoom}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card detail dialog */}
      {selectedCard && (
        <CardDetailDialog
          card={selectedCard}
          col={getCardColumn(selectedCard.id)}
          checklists={checklists[selectedCard.id] || []}
          canToggle={canToggleChecklist}
          onToggle={(key) => toggleChecklist(selectedCard.id, key)}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
