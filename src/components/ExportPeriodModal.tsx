import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  /** If provided, shows a Sales multiselect filter above the date picker */
  salesList?: string[];
  /** Field name on each record that holds the sales name. Default: "sales_name" */
  salesField?: string;
  onClose: () => void;
  onConfirm: (filteredData: any[], period: DateRange, selectedSales: string[]) => void;
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

// ─── Sales multiselect ────────────────────────────────────────────────────────

interface SalesMultiSelectProps {
  salesList: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function SalesMultiSelect({ salesList, selected, onChange }: SalesMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const allSelected = selected.length === salesList.length;
  const noneSelected = selected.length === 0;

  const placeholder = noneSelected
    ? "Pilih Sales..."
    : allSelected
    ? "Semua Sales"
    : `${selected.length} Sales dipilih`;

  function toggleAll() {
    onChange(allSelected ? [] : [...salesList]);
  }

  function toggleOne(name: string) {
    onChange(
      selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md bg-background transition-colors hover:border-primary ${
          noneSelected ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        <span>{placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover text-popover-foreground border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
          {/* Pilih Semua / Hapus Semua */}
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground border-b border-border sticky top-0 bg-popover"
            onClick={toggleAll}
          >
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="sales-all" />
            <label htmlFor="sales-all" className="text-sm font-medium cursor-pointer select-none">
              {allSelected ? "Hapus Semua" : "Pilih Semua"}
            </label>
          </div>

          {salesList.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => toggleOne(name)}
            >
              <Checkbox
                checked={selected.includes(name)}
                onCheckedChange={() => toggleOne(name)}
                id={`sales-${name}`}
              />
              <label
                htmlFor={`sales-${name}`}
                className="text-sm cursor-pointer select-none flex-1"
              >
                {name}
              </label>
              {selected.includes(name) && (
                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ExportPeriodModal({
  isOpen,
  format,
  defaultDateRange,
  allData,
  dateField = "order_date",
  salesList,
  salesField = "sales_name",
  onClose,
  onConfirm,
}: ExportPeriodModalProps) {
  const today = midnight(new Date());

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);

  // Reset state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setStartDate(midnight(defaultDateRange.start));
      setEndDate(midnight(defaultDateRange.end));
      setSelectedSales(salesList ? [...salesList] : []);
    }
  }, [isOpen, defaultDateRange, salesList]);

  // ─── filtered data (date + sales) ──────────────────────────────────────────

  const filteredData = useMemo(() => {
    let result = allData;

    // Date filter
    if (startDate || endDate) {
      result = result.filter((item) => {
        const od = midnight(new Date(item[dateField]));
        const matchStart = !startDate || od >= startDate;
        const matchEnd = !endDate || od <= endDate;
        return matchStart && matchEnd;
      });
    }

    // Sales filter (only when salesList is provided and not all selected)
    if (salesList && selectedSales.length < salesList.length) {
      result = result.filter((item) => selectedSales.includes(item[salesField]));
    }

    return result;
  }, [allData, startDate, endDate, dateField, salesList, selectedSales, salesField]);

  // ─── summary text ───────────────────────────────────────────────────────────

  const summaryText = useMemo(() => {
    const count = filteredData.length;
    if (!salesList) return `${count} data ditemukan pada periode ini`;

    const allSalesSelected = selectedSales.length === salesList.length;
    const salesDesc = allSalesSelected
      ? "semua sales"
      : `${selectedSales.length} sales`;

    return `${count} SO ditemukan untuk ${salesDesc} pada periode ini`;
  }, [filteredData.length, salesList, selectedSales]);

  const isEmpty = filteredData.length === 0;
  const noneSelected = salesList ? selectedSales.length === 0 : false;
  const exportDisabled = isEmpty || noneSelected;

  // ─── quick select presets ─────────────────────────────────────────────────

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
    onConfirm(filteredData, { start: startDate, end: endDate }, selectedSales);
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
          {/* Sales multiselect — hanya tampil jika salesList disediakan */}
          {salesList && salesList.length > 0 && (
            <div className="space-y-1.5">
              <Label>Sales</Label>
              <SalesMultiSelect
                salesList={salesList}
                selected={selectedSales}
                onChange={setSelectedSales}
              />
            </div>
          )}

          {/* Periode */}
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
                      : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

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

          {/* Ringkasan realtime */}
          <p className={`text-sm ${isEmpty ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
            {isEmpty
              ? noneSelected
                ? "Pilih minimal satu sales untuk melanjutkan"
                : "0 SO ditemukan — coba ubah filter"
              : summaryText}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={handleConfirm} disabled={exportDisabled}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
