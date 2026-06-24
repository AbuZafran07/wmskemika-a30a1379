import { useMemo, useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportPeriodModal } from "@/components/ExportPeriodModal";
import { useExportSO, type ExportFilters } from "@/hooks/useExportSO";
import type { SalesOrderHeader } from "@/hooks/useSalesOrders";

interface ExportButtonProps {
  data: SalesOrderHeader[];
  filters: ExportFilters;
}

function midnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ExportButton({ data, filters }: ExportButtonProps) {
  const {
    exportPDF,
    exportExcel,
    isExporting,
    isModalOpen,
    selectedFormat,
    closeModal,
    handleConfirmExport,
  } = useExportSO();

  const [dropdownOpen, setDropdownOpen] = useState(false);
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

  // Default date range: dari filter aktif halaman, atau bulan berjalan
  const defaultDateRange = useMemo(() => {
    const today = midnight(new Date());
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      start: filters.dateFrom ? midnight(new Date(filters.dateFrom + "T00:00:00")) : firstOfMonth,
      end: filters.dateTo ? midnight(new Date(filters.dateTo + "T00:00:00")) : today,
    };
  }, [filters.dateFrom, filters.dateTo]);

  // Unique list of sales names from data, sorted A-Z
  const salesList = useMemo(() => {
    const names = new Set(data.map((o) => o.sales_name).filter(Boolean));
    return [...names].sort() as string[];
  }, [data]);

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
              onClick={() => { setDropdownOpen(false); exportPDF(); }}
            >
              <FileText className="w-4 h-4 text-red-500" />
              Export as PDF
            </button>
            <button
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => { setDropdownOpen(false); exportExcel(); }}
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Export as Excel
            </button>
          </div>
        )}
      </div>

      {isModalOpen && selectedFormat && (
        <ExportPeriodModal
          isOpen={isModalOpen}
          format={selectedFormat}
          defaultDateRange={defaultDateRange}
          allData={data}
          dateField="order_date"
          salesList={salesList}
          salesField="sales_name"
          onClose={closeModal}
          onConfirm={(filteredData, period, selectedSales) =>
            handleConfirmExport(
              filteredData as SalesOrderHeader[],
              period,
              filters.status,
              selectedSales,
              salesList.length
            )
          }
        />
      )}
    </>
  );
}
