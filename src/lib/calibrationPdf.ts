import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// ── page geometry ─────────────────────────────────────────────────────────────

const A4_W = 210;
const A4_H = 297;
const M_LEFT = 14;
const M_RIGHT = 14;
const CONTENT_W = A4_W - M_LEFT - M_RIGHT;
// Kop surat header occupies top ~45mm; content starts below it
const M_TOP = 47;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(v || 0));
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMMM yyyy", { locale: idLocale }); } catch { return d; }
}

async function imgToBase64(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = src + (src.includes("?") ? "&" : "?") + "_t=" + Date.now();
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

async function getSignatureBase64(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("user_signatures")
    .select("signature_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.signature_path) return null;
  const { data: pub } = supabase.storage.from("signatures").getPublicUrl(data.signature_path);
  if (!pub?.publicUrl) return null;
  return imgToBase64(pub.publicUrl);
}

function addBg(doc: jsPDF, bgData: string | null) {
  if (bgData) doc.addImage(bgData, "JPEG", 0, 0, A4_W, A4_H);
}

function sectionHeader(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(220, 228, 252);
  doc.rect(M_LEFT, y - 3.5, CONTENT_W, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(text, M_LEFT + 2, y + 0.5);
  return y + 8;
}

function infoRow(doc: jsPDF, label: string, value: string, y: number, labelW = 44, colonW = 4): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(label, M_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(":", M_LEFT + labelW, y);
  const lines = doc.splitTextToSize(value, CONTENT_W - labelW - colonW - 2);
  doc.text(lines, M_LEFT + labelW + colonW, y);
  return y + lines.length * 4.8;
}

// ── SPK PDF — F-KAL-02 ───────────────────────────────────────────────────────

export async function generateSPKPdf(salesOrderId: string) {
  // 1. Fetch data
  const { data: so, error } = await supabase
    .from("sales_order_headers")
    .select(`
      id, sales_order_number, spk_number, spk_issued_at, order_date,
      target_completion_date, service_location, service_pic_name, service_pic_phone,
      grand_total, notes, sales_name, lab_manager_user_id,
      customer:customers(name, address, phone)
    `)
    .eq("id", salesOrderId)
    .single();

  if (error || !so) throw new Error("Data SO tidak ditemukan");

  const { data: items } = await supabase
    .from("calibration_items")
    .select("item_number, instrument_name, brand_model, serial_number, measurement_range, calibration_method, sla_working_days, unit_price")
    .eq("sales_order_id", salesOrderId)
    .order("item_number");

  // 2. Assets
  const [bgData, mgr_sig] = await Promise.all([
    imgToBase64("/kop-surat-bg.jpg"),
    getSignatureBase64((so as any).lab_manager_user_id),
  ]);

  // 3. Build PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addBg(doc, bgData);

  let y = M_TOP;

  // Form number (top-right, small)
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("F-KAL-02", A4_W - M_RIGHT, 10, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("SURAT PERINTAH KERJA (SPK)", A4_W / 2, y, { align: "center" });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No. SPK : ${(so as any).spk_number || "-"}`, A4_W / 2, y, { align: "center" });
  y += 4.5;
  doc.text(
    `Tanggal : ${fmtDate((so as any).spk_issued_at || (so as any).order_date)}`,
    A4_W / 2, y, { align: "center" },
  );
  y += 7;

  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.3);
  doc.line(M_LEFT, y, A4_W - M_RIGHT, y);
  y += 6;

  // Info rows
  const customer = (so as any).customer;
  const LABEL_W = 42;

  const infoItems: [string, string][] = [
    ["Customer", customer?.name || "-"],
    ["Alamat", customer?.address || "-"],
    ["PIC Customer", (so as any).service_pic_name || "-"],
    ["Telepon PIC", (so as any).service_pic_phone || "-"],
    ["Sales", (so as any).sales_name || "-"],
    ["No. SO", (so as any).sales_order_number],
    ["Lokasi Servis", (so as any).service_location || "-"],
    ["Target Penyelesaian", fmtDate((so as any).target_completion_date)],
  ];

  for (const [label, value] of infoItems) {
    y = infoRow(doc, label, value, y, LABEL_W);
    y += 0.5;
  }

  y += 4;

  // Instrument table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Daftar Alat Kalibrasi", M_LEFT, y);
  y += 2;

  const tableBody = (items || []).map((item) => [
    item.item_number,
    item.instrument_name,
    item.brand_model || "-",
    item.serial_number || "-",
    item.measurement_range || "-",
    item.calibration_method || "-",
    item.sla_working_days != null ? `${item.sla_working_days} hr` : "-",
    fmt(Number(item.unit_price)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Nama Alat", "Merk/Model", "No. Seri", "Range", "Metode", "SLA", "Harga"]],
    body: tableBody,
    margin: { left: M_LEFT, right: M_RIGHT },
    styles: { fontSize: 7.5, cellPadding: [1.5, 2] },
    headStyles: { fillColor: [30, 80, 160], textColor: 255, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      6: { cellWidth: 14, halign: "center" },
      7: { halign: "right", cellWidth: 24 },
    },
    didDrawPage: (data) => {
      // Add background for continuation pages only (page 1 already has it)
      if (data.pageNumber > 1) addBg(doc, bgData);
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total : ${fmt(Number((so as any).grand_total))}`, A4_W - M_RIGHT, y, { align: "right" });
  y += 8;

  // Notes
  if ((so as any).notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Catatan:", M_LEFT, y);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize((so as any).notes, CONTENT_W);
    doc.text(noteLines, M_LEFT, y + 4.5);
    y += 4.5 + noteLines.length * 4.5 + 4;
  }

  // Signatures — push to bottom if page has room
  const sigY = Math.max(y + 6, A4_H - 58);
  const colW = CONTENT_W / 2;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");

  // Left: customer PIC
  doc.text("Mengetahui,", M_LEFT, sigY);
  doc.text("PIC Customer", M_LEFT, sigY + 4.5);
  doc.line(M_LEFT, sigY + 26, M_LEFT + 44, sigY + 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text((so as any).service_pic_name || "_____________________", M_LEFT, sigY + 30);

  // Right: Lab Manager
  const rX = M_LEFT + colW;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Menyetujui,", rX, sigY);
  doc.text("Lab Manager — PT. Kemika Karya Pratama", rX, sigY + 4.5);

  if (mgr_sig) {
    try {
      doc.addImage(mgr_sig, "PNG", rX, sigY + 6.5, 36, 18);
    } catch {}
  } else {
    doc.line(rX, sigY + 26, rX + 44, sigY + 26);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("(                                    )", rX, sigY + 30);

  // Save
  doc.save(`SPK-${(so as any).spk_number || (so as any).sales_order_number}.pdf`);
}

// ── Certificate PDF — F-KAL-05 ────────────────────────────────────────────────

export async function generateCertificatePdf(
  salesOrderId: string,
  calibrationItemId?: string,
) {
  // 1. Fetch SO info
  const { data: so } = await supabase
    .from("sales_order_headers")
    .select("id, sales_order_number, spk_number, customer:customers(name)")
    .eq("id", salesOrderId)
    .single();

  // 2. Fetch calibration items (all columns via * to access extra DB fields)
  let q = supabase
    .from("calibration_items")
    .select("*")
    .eq("sales_order_id", salesOrderId)
    .order("item_number");

  if (calibrationItemId) q = (q as any).eq("id", calibrationItemId);

  const { data: items } = await q;
  if (!items || items.length === 0) throw new Error("Tidak ada alat kalibrasi");

  // 3. Background
  const bgData = await imgToBase64("/kop-surat-bg.jpg");

  // 4. Build PDF — one page per instrument
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const LABEL_W = 42;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx] as any;

    if (idx > 0) doc.addPage();
    addBg(doc, bgData);

    let y = M_TOP;

    // Form number
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text("F-KAL-05", A4_W - M_RIGHT, 10, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("SERTIFIKAT KALIBRASI", A4_W / 2, y, { align: "center" });
    y += 6.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`No. Sertifikat : ${item.certificate_number || "-"}`, A4_W / 2, y, { align: "center" });
    y += 4.5;
    doc.text(
      `Tanggal Terbit : ${fmtDate(item.certificate_issued_at)}`,
      A4_W / 2, y, { align: "center" },
    );
    y += 7;

    doc.setDrawColor(140, 140, 140);
    doc.setLineWidth(0.3);
    doc.line(M_LEFT, y, A4_W - M_RIGHT, y);
    y += 6;

    // SO / Customer context
    const soInfoItems: [string, string][] = [
      ["No. SPK", (so as any)?.spk_number || "-"],
      ["Customer", (so as any)?.customer?.name || "-"],
      ["No. SO", (so as any)?.sales_order_number || "-"],
    ];

    for (const [label, value] of soInfoItems) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 5;

    // Section: Data Alat
    y = sectionHeader(doc, "DATA ALAT", y);

    const alatRows: [string, string][] = [
      ["Nama Alat", item.instrument_name],
      ["Merk / Model", item.brand_model || "-"],
      ["No. Seri", item.serial_number || "-"],
      ["Range Ukur", item.measurement_range || "-"],
      ["Metode Kalibrasi", item.calibration_method || "-"],
    ];

    for (const [label, value] of alatRows) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 4;

    // Section: Data Kalibrasi
    y = sectionHeader(doc, "DATA KALIBRASI", y);

    const kalibRows: [string, string][] = [
      ["Metode Standar", item.standard_method || "-"],
      ["Ketertelusuran", item.traceability || "-"],
      ["Suhu Lingkungan", item.env_temperature != null ? `${item.env_temperature} °C` : "-"],
      ["Kelembaban", item.env_humidity != null ? `${item.env_humidity} %RH` : "-"],
    ];

    for (const [label, value] of kalibRows) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 4;

    // Section: Hasil & Kesimpulan
    y = sectionHeader(doc, "HASIL & KESIMPULAN", y);

    const withinLimits = !item.calibration_conclusion || item.calibration_conclusion === "within_limits";
    const conclusionText = withinLimits ? "DALAM BATAS  (Within Limits)" : "DI LUAR BATAS  (Out of Limits)";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Kesimpulan", M_LEFT, y);
    doc.setFont("helvetica", "bold");
    doc.text(":", M_LEFT + LABEL_W, y);
    if (withinLimits) {
      doc.setTextColor(20, 120, 40);
    } else {
      doc.setTextColor(180, 30, 30);
    }
    doc.text(conclusionText, M_LEFT + LABEL_W + 4, y);
    doc.setTextColor(0, 0, 0);
    y += 5.5;

    if (item.calibration_notes) {
      y = infoRow(doc, "Catatan", item.calibration_notes, y, LABEL_W);
      y += 0.5;
    }

    y += 6;

    // Signatures
    const [tech_sig, auth_sig] = await Promise.all([
      getSignatureBase64(item.calibration_executed_by),
      getSignatureBase64(item.certificate_authorized_by),
    ]);

    const sigY = Math.max(y, A4_H - 60);
    const colW = CONTENT_W / 2;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");

    // Left: Teknisi
    doc.text("Dilaksanakan oleh,", M_LEFT, sigY);
    doc.text("Teknisi Kalibrasi", M_LEFT, sigY + 4.5);

    if (tech_sig) {
      try { doc.addImage(tech_sig, "PNG", M_LEFT, sigY + 6.5, 36, 18); } catch {}
    } else {
      doc.line(M_LEFT, sigY + 26, M_LEFT + 44, sigY + 26);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PT. Kemika Karya Pratama", M_LEFT, sigY + 30);

    // Right: Otorisasi
    const rX = M_LEFT + colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Disetujui oleh,", rX, sigY);
    doc.text("Manajer Lab", rX, sigY + 4.5);

    if (auth_sig) {
      try { doc.addImage(auth_sig, "PNG", rX, sigY + 6.5, 36, 18); } catch {}
    } else {
      doc.line(rX, sigY + 26, rX + 44, sigY + 26);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PT. Kemika Karya Pratama", rX, sigY + 30);
  }

  const fname = items.length === 1
    ? `Sertifikat-${items[0].certificate_number || items[0].id}.pdf`
    : `Sertifikat-${(so as any)?.spk_number || salesOrderId}.pdf`;

  doc.save(fname);
}
