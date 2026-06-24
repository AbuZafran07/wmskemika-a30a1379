import { useMemo, useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportPeriodModal } from "@/components/ExportPeriodModal";
import { useExportPO } from "@/hooks/useExportPO";
import type { PlanOrderHeader } from "@/hooks/usePlanOrders";

interface ExportPOButtonProps {
  data: PlanOrderHeader[];
  statusFilter: string;
  dateFrom: string;
  dateTo: string;
}

function midnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ExportPOButton({ data, statusFilter, dateFrom, dateTo }: ExportPOButtonProps) {
  const {
    exportPDF,
    exportExcel,
    isExporting,
    isModalOpen,
    selectedFormat,
    closeModal,
    handleConfirmExport,
  } = useExportPO();

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

  const defaultDateRange = useMemo(() => {
    const today = midnight(new Date());
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      start: dateFrom ? midnight(new Date(dateFrom + "T00:00:00")) : firstOfMonth,
      end: dateTo ? midnight(new Date(dateTo + "T00:00:00")) : today,
    };
  }, [dateFrom, dateTo]);

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
          dateField="plan_date"
          onClose={closeModal}
          onConfirm={(filteredData, period) =>
            handleConfirmExport(filteredData as PlanOrderHeader[], period, statusFilter)
          }
        />
      )}
    </>
  );
}
