import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
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
import { useExportSO, type ExportFilters } from "@/hooks/useExportSO";
import type { SalesOrderHeader } from "@/hooks/useSalesOrders";

type PeriodType = "all" | "month" | "range";
type ExportFormat = "pdf" | "excel";

interface ExportButtonProps {
  data: SalesOrderHeader[];
  filters: ExportFilters;
}

function getLastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
}

function filterByPeriod(
  data: SalesOrderHeader[],
  periodType: PeriodType,
  month: string,
  dateFrom: string,
  dateTo: string
): SalesOrderHeader[] {
  if (periodType === "month" && month) {
    return data.filter((o) => o.order_date.startsWith(month));
  }
  if (periodType === "range") {
    return data.filter((o) => {
      const od = new Date(o.order_date);
      const matchFrom = !dateFrom || od >= new Date(dateFrom);
      const matchTo = !dateTo || od <= new Date(dateTo);
      return matchFrom && matchTo;
    });
  }
  return data;
}

export function ExportButton({ data, filters }: ExportButtonProps) {
  const { exportPDF, exportExcel, isExporting } = useExportSO();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pdf");

  const [periodType, setPeriodType] = useState<PeriodType>("all");
  const [month, setMonth] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  function openDialog(fmt: ExportFormat) {
    setDropdownOpen(false);
    setFormat(fmt);
    setPeriodType("all");
    setMonth("");
    setDateFrom("");
    setDateTo("");
    setDialogOpen(true);
  }

  async function handleExport() {
    const exportData = filterByPeriod(data, periodType, month, dateFrom, dateTo);

    const exportFilters: ExportFilters = {
      status: filters.status,
      dateFrom:
        periodType === "month" && month
          ? `${month}-01`
          : periodType === "range"
          ? dateFrom
          : filters.dateFrom,
      dateTo:
        periodType === "month" && month
          ? getLastDayOfMonth(month)
          : periodType === "range"
          ? dateTo
          : filters.dateTo,
    };

    setDialogOpen(false);

    if (format === "pdf") {
      await exportPDF(exportData, exportFilters);
    } else {
      await exportExcel(exportData, exportFilters);
    }
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          disabled={isExporting}
          onClick={() => setDropdownOpen((v) => !v)}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Mengekspor..." : "Export"}
          <ChevronDown className="w-3 h-3" />
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
            <button
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => openDialog("pdf")}
            >
              <FileText className="w-4 h-4 text-red-500" />
              Export as PDF
            </button>
            <button
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => openDialog("excel")}
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Export as Excel
            </button>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Sales Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <p className="text-sm text-muted-foreground">
              Format:{" "}
              <span className="font-medium text-foreground">
                {format === "pdf" ? "PDF" : "Excel (.xlsx)"}
              </span>
            </p>

            <div className="space-y-3">
              <Label>Periode Export</Label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="periodType"
                  value="all"
                  checked={periodType === "all"}
                  onChange={() => setPeriodType("all")}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Semua data</p>
                  <p className="text-xs text-muted-foreground">Sesuai filter aktif di halaman</p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="periodType"
                  value="month"
                  checked={periodType === "month"}
                  onChange={() => setPeriodType("month")}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Pilih bulan</p>
                  {periodType === "month" && (
                    <Input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="mt-2"
                    />
                  )}
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="periodType"
                  value="range"
                  checked={periodType === "range"}
                  onChange={() => setPeriodType("range")}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Rentang tanggal</p>
                  {periodType === "range" && (
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Dari</Label>
                        <Input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Sampai</Label>
                        <Input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Mengekspor..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
