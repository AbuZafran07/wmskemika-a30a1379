import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportSO, type ExportFilters } from "@/hooks/useExportSO";
import type { SalesOrderHeader } from "@/hooks/useSalesOrders";

interface ExportButtonProps {
  data: SalesOrderHeader[];
  filters: ExportFilters;
}

export function ExportButton({ data, filters }: ExportButtonProps) {
  const { exportPDF, exportExcel, isExporting } = useExportSO();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handlePDF() {
    setOpen(false);
    await exportPDF(data, filters);
  }

  async function handleExcel() {
    setOpen(false);
    await exportExcel(data, filters);
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        disabled={isExporting}
        onClick={() => setOpen((v) => !v)}
        className="gap-2"
      >
        <Download className="w-4 h-4" />
        {isExporting ? "Mengekspor..." : "Export"}
        <ChevronDown className="w-3 h-3" />
      </Button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={handlePDF}
          >
            <FileText className="w-4 h-4 text-red-500" />
            Export as PDF
          </button>
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={handleExcel}
          >
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            Export as Excel
          </button>
        </div>
      )}
    </div>
  );
}
