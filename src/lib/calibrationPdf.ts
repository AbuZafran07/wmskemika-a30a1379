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
  try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd MMMM yyyy", { locale: idLocale }); }
  catch { return d; }
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

export async function generateSPKPdf(receiptId: string) {
  // 1. Fetch receipt + customer
  const { data: receipt, error } = await supabase
    .from("calibration_receipts")
    .select(`
      id, receipt_number, spk_number, spk_issued_at, spk_signed_at,
      received_date, target_completion_date, service_location,
      service_pic_name, service_pic_phone, customer_request_notes,
      lab_manager_user_id,
      customer:customers(name, address, phone)
    `)
    .eq("id", receiptId)
    .single();

  if (error || !receipt) throw new Error("Data penerimaan tidak ditemukan");

  // 2. Fetch instruments
  const { data: instruments } = await supabase
    .from("calibration_instruments")
    .select("item_number, instrument_name, brand_model, serial_number, measurement_range, calibration_method, sla_working_days, unit_price")
    .eq("calibration_receipt_id", receiptId)
    .order("item_number");

  // 3. Assets
  const [bgData, mgrSig] = await Promise.all([
    imgToBase64("/kop-surat-bg.jpg"),
    getSignatureBase64((receipt as any).lab_manager_user_id),
  ]);

  // 4. Build PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addBg(doc, bgData);

  let y = M_TOP;
  const LABEL_W = 46;

  // Form number
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
  doc.text(`No. SPK : ${(receipt as any).spk_number || "-"}`, A4_W / 2, y, { align: "center" });
  y += 4.5;
  doc.text(
    `Tanggal : ${fmtDate((receipt as any).spk_issued_at || (receipt as any).received_date)}`,
    A4_W / 2, y, { align: "center" },
  );
  y += 7;

  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.3);
  doc.line(M_LEFT, y, A4_W - M_RIGHT, y);
  y += 6;

  // Info rows
  const customer = (receipt as any).customer;
  const infoItems: [string, string][] = [
    ["Customer",              customer?.name || "-"],
    ["Alamat",                customer?.address || "-"],
    ["PIC Customer",          (receipt as any).service_pic_name || "-"],
    ["Telepon PIC",           (receipt as any).service_pic_phone || "-"],
    ["No. Tanda Terima",      (receipt as any).receipt_number],
    ["Lokasi Kalibrasi",      (receipt as any).service_location || "-"],
    ["Target Penyelesaian",   fmtDate((receipt as any).target_completion_date)],
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

  const grandTotal = (instruments || []).reduce((s, i) => s + Number(i.unit_price || 0), 0);

  const tableBody = (instruments || []).map((item) => [
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
      7: { halign: "right", cellWidth: 26 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) addBg(doc, bgData);
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total : ${fmt(grandTotal)}`, A4_W - M_RIGHT, y, { align: "right" });
  y += 8;

  // Catatan
  const notes = (receipt as any).customer_request_notes;
  if (notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Catatan:", M_LEFT, y);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(notes, CONTENT_W);
    doc.text(noteLines, M_LEFT, y + 4.5);
    y += 4.5 + noteLines.length * 4.5 + 4;
  }

  // Signatures
  const sigY = Math.max(y + 6, A4_H - 58);
  const colW = CONTENT_W / 2;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");

  // Left: PIC Customer
  doc.text("Mengetahui,", M_LEFT, sigY);
  doc.text("PIC Customer", M_LEFT, sigY + 4.5);
  doc.line(M_LEFT, sigY + 26, M_LEFT + 44, sigY + 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text((receipt as any).service_pic_name || "_____________________", M_LEFT, sigY + 30);

  // Right: Lab Manager
  const rX = M_LEFT + colW;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Menyetujui,", rX, sigY);
  doc.text("Lab Manager — PT. Kemika Karya Pratama", rX, sigY + 4.5);

  if (mgrSig) {
    try { doc.addImage(mgrSig, "PNG", rX, sigY + 6.5, 36, 18); } catch {}
  } else {
    doc.line(rX, sigY + 26, rX + 44, sigY + 26);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("(                                    )", rX, sigY + 30);

  doc.save(`SPK-${(receipt as any).spk_number || (receipt as any).receipt_number}.pdf`);
}

// ── Certificate PDF — F-KAL-05 ────────────────────────────────────────────────

export async function generateCertificatePdf(receiptId: string, instrumentId?: string) {
  // 1. Fetch receipt
  const { data: receipt } = await supabase
    .from("calibration_receipts")
    .select("id, receipt_number, spk_number, customer:customers(name)")
    .eq("id", receiptId)
    .single();

  // 2. Fetch instruments
  let q = supabase
    .from("calibration_instruments")
    .select("*")
    .eq("calibration_receipt_id", receiptId)
    .order("item_number");

  if (instrumentId) q = (q as any).eq("id", instrumentId);

  const { data: instruments } = await q;
  if (!instruments || instruments.length === 0) throw new Error("Tidak ada data alat kalibrasi");

  // 3. Background
  const bgData = await imgToBase64("/kop-surat-bg.jpg");
  const LABEL_W = 44;

  // 4. Build PDF — one page per instrument
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let idx = 0; idx < instruments.length; idx++) {
    const item = instruments[idx] as any;

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

    // Receipt/customer context
    for (const [label, value] of [
      ["No. SPK",        (receipt as any)?.spk_number || "-"] as [string, string],
      ["Customer",       (receipt as any)?.customer?.name || "-"] as [string, string],
      ["No. Tanda Terima", (receipt as any)?.receipt_number || "-"] as [string, string],
    ]) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 5;

    // DATA ALAT
    y = sectionHeader(doc, "DATA ALAT", y);
    for (const [label, value] of [
      ["Nama Alat",       item.instrument_name] as [string, string],
      ["Merk / Model",    item.brand_model || "-"] as [string, string],
      ["No. Seri",        item.serial_number || "-"] as [string, string],
      ["Range Ukur",      item.measurement_range || "-"] as [string, string],
      ["Metode Kalibrasi",item.calibration_method || "-"] as [string, string],
    ]) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 4;

    // DATA KALIBRASI
    y = sectionHeader(doc, "DATA KALIBRASI", y);
    for (const [label, value] of [
      ["Metode Standar",  item.standard_method || "-"] as [string, string],
      ["Ketertelusuran",  item.traceability || "-"] as [string, string],
      ["Suhu Lingkungan", item.env_temperature != null ? `${item.env_temperature} °C` : "-"] as [string, string],
      ["Kelembaban",      item.env_humidity != null ? `${item.env_humidity} %RH` : "-"] as [string, string],
    ]) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 4;

    // HASIL & KESIMPULAN
    y = sectionHeader(doc, "HASIL & KESIMPULAN", y);

    const withinLimits = !item.calibration_conclusion || item.calibration_conclusion === "within_limits";
    const conclusionText = withinLimits ? "DALAM BATAS  (Within Limits)" : "DI LUAR BATAS  (Out of Limits)";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Kesimpulan", M_LEFT, y);
    doc.text(":", M_LEFT + LABEL_W, y);
    doc.setTextColor(withinLimits ? 20 : 180, withinLimits ? 120 : 30, withinLimits ? 40 : 30);
    doc.text(conclusionText, M_LEFT + LABEL_W + 4, y);
    doc.setTextColor(0, 0, 0);
    y += 5.5;

    if (item.calibration_notes) {
      y = infoRow(doc, "Catatan", item.calibration_notes, y, LABEL_W);
      y += 0.5;
    }

    y += 6;

    // Signatures
    const [techSig, authSig] = await Promise.all([
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
    if (techSig) {
      try { doc.addImage(techSig, "PNG", M_LEFT, sigY + 6.5, 36, 18); } catch {}
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
    if (authSig) {
      try { doc.addImage(authSig, "PNG", rX, sigY + 6.5, 36, 18); } catch {}
    } else {
      doc.line(rX, sigY + 26, rX + 44, sigY + 26);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PT. Kemika Karya Pratama", rX, sigY + 30);
  }

  const fname = instruments.length === 1
    ? `Sertifikat-${instruments[0].certificate_number || instruments[0].id}.pdf`
    : `Sertifikat-${(receipt as any)?.spk_number || receiptId}.pdf`;

  doc.save(fname);
}
