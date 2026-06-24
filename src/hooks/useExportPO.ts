import { useState } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { PlanOrderHeader } from "./usePlanOrders";

export type ExportPOFormat = "pdf" | "excel";

export interface DateRangePO {
  start: Date | null;
  end: Date | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateObj(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatDateFile(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function buildFilterInfo(status: string, period: DateRangePO): string {
  const parts: string[] = [];
  if (status && status !== "all") parts.push(`Status: ${status}`);
  if (period.start && period.end) {
    parts.push(`Periode: ${formatDateObj(period.start)} - ${formatDateObj(period.end)}`);
  } else if (period.start) {
    parts.push(`Dari: ${formatDateObj(period.start)}`);
  } else if (period.end) {
    parts.push(`Sampai: ${formatDateObj(period.end)}`);
  }
  return parts.join(" | ");
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  revision_requested: "Revision Requested",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

function buildRows(data: PlanOrderHeader[]) {
  return data.map((order, index) => ({
    no: index + 1,
    poNumber: order.plan_number,
    date: formatDate(order.plan_date),
    supplier: order.supplier?.name || "-",
    expectedDelivery: formatDate(order.expected_delivery_date),
    amount: order.grand_total,
    status: order.status,
  }));
}

// ─── private generate functions ───────────────────────────────────────────────

async function generatePDF(data: PlanOrderHeader[], status: string, period: DateRangePO) {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const rows = buildRows(data);
  const filterInfo = buildFilterInfo(status, period);
  const exportedAt = formatDateObj(new Date());

  let y = 14;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Plan Order Report", 14, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Diekspor pada: ${exportedAt}`, 14, y);
  y += 6;

  if (filterInfo) {
    doc.text(filterInfo, 14, y);
    y += 6;
  }

  autoTable(doc, {
    startY: y + 2,
    head: [["No", "PO Number", "Date", "Supplier", "Expected Delivery", "Amount", "Status"]],
    body: rows.map((r) => [
      r.no,
      r.poNumber,
      r.date,
      r.supplier,
      r.expectedDelivery,
      formatCurrency(r.amount),
      STATUS_LABELS[r.status] ?? r.status,
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [11, 107, 58], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 10 },
      5: { halign: "right" },
    },
    didDrawPage: (hookData) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = hookData.pageNumber;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Halaman ${currentPage} dari ${pageCount}`,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: "right" }
      );
    },
  });

  doc.save(`plan-order-${formatDateFile()}.pdf`);
}

async function generateExcel(data: PlanOrderHeader[], status: string, period: DateRangePO) {
  const rows = buildRows(data);
  const filterInfo = buildFilterInfo(status, period);
  const exportedAt = formatDateObj(new Date());

  const wsData: any[][] = [];
  wsData.push(["Plan Order Report"]);
  wsData.push([`Diekspor pada: ${exportedAt}`]);
  wsData.push([filterInfo || ""]);
  wsData.push([]);
  wsData.push(["No", "PO Number", "Date", "Supplier", "Expected Delivery", "Amount", "Status"]);

  rows.forEach((r) => {
    wsData.push([
      r.no,
      r.poNumber,
      r.date,
      r.supplier,
      r.expectedDelivery,
      r.amount,
      STATUS_LABELS[r.status] ?? r.status,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  if (!ws["A1"]) ws["A1"] = {};
  ws["A1"].s = { font: { bold: true, sz: 14 } };

  ["A", "B", "C", "D", "E", "F", "G"].forEach((col) => {
    const cell = `${col}5`;
    if (!ws[cell]) ws[cell] = {};
    ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: "D9D9D9" } } };
  });

  for (let i = 0; i < rows.length; i++) {
    const cell = `F${6 + i}`;
    if (ws[cell]) ws[cell].z = "#,##0";
  }

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  ws["!cols"] = [
    { wch: 5 },
    { wch: 18 },
    { wch: 14 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plan Order");
  XLSX.writeFile(wb, `plan-order-${formatDateFile()}.xlsx`);
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useExportPO() {
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportPOFormat | null>(null);

  function exportPDF() {
    setSelectedFormat("pdf");
    setIsModalOpen(true);
  }

  function exportExcel() {
    setSelectedFormat("excel");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedFormat(null);
  }

  async function handleConfirmExport(
    data: PlanOrderHeader[],
    period: DateRangePO,
    statusFilter: string
  ) {
    if (data.length === 0) {
      toast.warning("Tidak ada data untuk diexport");
      return;
    }

    const format = selectedFormat;
    closeModal();
    setIsExporting(true);

    try {
      if (format === "pdf") {
        await generatePDF(data, statusFilter, period);
      } else if (format === "excel") {
        await generateExcel(data, statusFilter, period);
      }
      toast.success("File berhasil diunduh", { duration: 3000 });
    } catch {
      toast.error("Gagal mengekspor. Coba lagi.");
    } finally {
      setIsExporting(false);
    }
  }

  return {
    exportPDF,
    exportExcel,
    isExporting,
    isModalOpen,
    selectedFormat,
    closeModal,
    handleConfirmExport,
  };
}
