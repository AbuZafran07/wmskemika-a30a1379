import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { DateRange, ExportFormat } from "@/hooks/useExportSO";

interface ExportPeriodModalProps {
  isOpen: boolean;
  format: ExportFormat;
  defaultDateRange: { start: Date; end: Date };
  allData: any[];
  /** Field name on each record that holds the date string. Default: "order_date" */
  dateField?: string;
  onClose: () => void;
  onConfirm: (filteredData: any[], period: DateRange) => void;
}

// ─── date helpers ─────────────────────────────────────────────────────────────

function toInputValue(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromInputValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function midnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function subMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() - n, date.getDate());
}

// ─── component ────────────────────────────────────────────────────────────────

export function ExportPeriodModal({
  isOpen,
  format,
  defaultDateRange,
  allData,
  dateField = "order_date",
  onClose,
  onConfirm,
}: ExportPeriodModalProps) {
  const today = midnight(new Date());

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStartDate(midnight(defaultDateRange.start));
      setEndDate(midnight(defaultDateRange.end));
    }
  }, [isOpen, defaultDateRange]);

  const filteredData = useMemo(() => {
    if (!startDate && !endDate) return allData;
    return allData.filter((item) => {
      const od = midnight(new Date(item[dateField]));
      const matchStart = !startDate || od >= startDate;
      const matchEnd = !endDate || od <= endDate;
      return matchStart && matchEnd;
    });
  }, [allData, startDate, endDate, dateField]);

  // ─── quick select presets ────────────────────────────────────────────────

  const presets = [
    { label: "Hari ini", start: today, end: today },
    {
      label: "7 Hari Terakhir",
      start: midnight(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)),
      end: today,
    },
    { label: "Bulan Ini", start: startOfMonth(today), end: today },
    {
      label: "Bulan Lalu",
      start: startOfMonth(subMonths(today, 1)),
      end: endOfMonth(subMonths(today, 1)),
    },
    { label: "3 Bulan Terakhir", start: startOfMonth(subMonths(today, 2)), end: today },
    { label: "Semua Data", start: null, end: null },
  ] as const;

  function applyPreset(start: Date | null, end: Date | null) {
    setStartDate(start ? midnight(start) : null);
    setEndDate(end ? midnight(end) : null);
  }

  function isPresetActive(start: Date | null, end: Date | null): boolean {
    const sMatch = start === null ? startDate === null : startDate?.getTime() === start.getTime();
    const eMatch = end === null ? endDate === null : endDate?.getTime() === end.getTime();
    return sMatch && eMatch;
  }

  function handleConfirm() {
    onConfirm(filteredData, { start: startDate, end: endDate });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {format === "pdf" ? "PDF" : "Excel"}</DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Format:{" "}
            <span className="font-medium text-foreground">
              {format === "pdf" ? "PDF" : "Excel (.xlsx)"}
            </span>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Quick select chips */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Pilih cepat</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.start, p.end)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    isPresetActive(p.start, p.end)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={toInputValue(startDate)}
                onChange={(e) => setStartDate(fromInputValue(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={toInputValue(endDate)}
                onChange={(e) => setEndDate(fromInputValue(e.target.value))}
                min={toInputValue(startDate)}
              />
            </div>
          </div>

          {/* Realtime count */}
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredData.length}</span> data
            ditemukan pada periode ini
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={handleConfirm}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
