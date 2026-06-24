import { useState } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { SalesOrderHeader } from "./useSalesOrders";

export interface ExportFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
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

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildFilterInfo(filters: ExportFilters): string {
  const parts: string[] = [];
  if (filters.status && filters.status !== "all") {
    parts.push(`Status: ${filters.status}`);
  }
  if (filters.dateFrom && filters.dateTo) {
    parts.push(`Periode: ${formatDate(filters.dateFrom)} - ${formatDate(filters.dateTo)}`);
  } else if (filters.dateFrom) {
    parts.push(`Dari: ${formatDate(filters.dateFrom)}`);
  } else if (filters.dateTo) {
    parts.push(`Sampai: ${formatDate(filters.dateTo)}`);
  }
  return parts.join(" | ");
}

function buildRows(data: SalesOrderHeader[]) {
  return data.map((order, index) => ({
    no: index + 1,
    soNumber: order.sales_order_number,
    date: formatDate(order.order_date),
    customer: order.customer
      ? order.customer.name + (order.project_instansi ? `\n${order.project_instansi}` : "")
      : "-",
    customerPo: order.customer_po_number || "-",
    sales: order.sales_name || "-",
    allocation: order.allocation_type || "-",
    amount: order.grand_total,
    status: order.status,
  }));
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  revision_requested: "Revision Requested",
  partially_delivered: "Partially Delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function useExportSO() {
  const [isExporting, setIsExporting] = useState(false);

  async function exportPDF(data: SalesOrderHeader[], filters: ExportFilters) {
    if (data.length === 0) {
      toast.warning("Tidak ada data untuk diexport");
      return;
    }

    setIsExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", format: "a4" });
      const rows = buildRows(data);
      const filterInfo = buildFilterInfo(filters);
      const exportedAt = formatDateDisplay(new Date());

      let y = 14;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Sales Order Report", 14, y);
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
        head: [["No", "SO Number", "Date", "Customer", "Customer PO", "Sales", "Allocation", "Amount", "Status"]],
        body: rows.map((r) => [
          r.no,
          r.soNumber,
          r.date,
          r.customer,
          r.customerPo,
          r.sales,
          r.allocation,
          formatCurrency(r.amount),
          STATUS_LABELS[r.status] ?? r.status,
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 10 },
          7: { halign: "right" },
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

      doc.save(`sales-order-${formatDateFile()}.pdf`);
      toast.success("File berhasil diunduh", { duration: 3000 });
    } catch {
      toast.error("Gagal mengekspor. Coba lagi.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportExcel(data: SalesOrderHeader[], filters: ExportFilters) {
    if (data.length === 0) {
      toast.warning("Tidak ada data untuk diexport");
      return;
    }

    setIsExporting(true);
    try {
      const rows = buildRows(data);
      const filterInfo = buildFilterInfo(filters);
      const exportedAt = formatDateDisplay(new Date());

      const wsData: any[][] = [];

      wsData.push(["Sales Order Report"]);
      wsData.push([`Diekspor pada: ${exportedAt}`]);
      if (filterInfo) wsData.push([filterInfo]);
      else wsData.push([]);
      wsData.push([]);
      wsData.push(["No", "SO Number", "Date", "Customer", "Customer PO", "Sales", "Allocation", "Amount", "Status"]);

      rows.forEach((r) => {
        wsData.push([
          r.no,
          r.soNumber,
          r.date,
          r.customer,
          r.customerPo,
          r.sales,
          r.allocation,
          r.amount,
          STATUS_LABELS[r.status] ?? r.status,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Bold title
      if (!ws["A1"]) ws["A1"] = {};
      ws["A1"].s = { font: { bold: true, sz: 14 } };

      // Bold header row (row 5, index 4)
      ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col) => {
        const cell = `${col}5`;
        if (!ws[cell]) ws[cell] = {};
        ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: "D9D9D9" } } };
      });

      // Format Amount column as number
      for (let i = 0; i < rows.length; i++) {
        const cell = `H${6 + i}`;
        if (ws[cell]) ws[cell].z = "#,##0";
      }

      // Merge title across columns
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

      ws["!cols"] = [
        { wch: 5 },
        { wch: 18 },
        { wch: 14 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 18 },
        { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Order");
      XLSX.writeFile(wb, `sales-order-${formatDateFile()}.xlsx`);

      toast.success("File berhasil diunduh", { duration: 3000 });
    } catch {
      toast.error("Gagal mengekspor. Coba lagi.");
    } finally {
      setIsExporting(false);
    }
  }

  return { exportPDF, exportExcel, isExporting };
}
