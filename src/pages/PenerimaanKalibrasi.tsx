import React, { useState, useCallback } from "react";
import {
  ClipboardList, Plus, Trash2, ChevronRight, Check, Loader2, Search,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomers } from "@/hooks/useMasterData";
import {
  useCalibrationReceipts,
  createCalibrationReceipt,
  CalibrationInstrumentInput,
  CalibrationReceiptRow,
} from "@/hooks/usePenerimaanKalibrasi";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  spk_issued: { label: "SPK Diterbitkan", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  spk_signed: { label: "SPK TTD", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  converted_to_so: { label: "Converted SO", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  cancelled: { label: "Dibatalkan", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ─── instrument row state ─────────────────────────────────────────────────────

interface InstrumentRow {
  _key: string;
  instrument_name: string;
  brand_model: string;
  serial_number: string;
  measurement_range: string;
  calibration_method: string;
  unit_price: string;
  sla_working_days: string;
}

function emptyInstrument(): InstrumentRow {
  return {
    _key: crypto.randomUUID(),
    instrument_name: "",
    brand_model: "",
    serial_number: "",
    measurement_range: "",
    calibration_method: "",
    unit_price: "0",
    sla_working_days: "5",
  };
}

// ─── step indicator ───────────────────────────────────────────────────────────

const STEPS = ["Info Penerimaan", "Daftar Alat", "Review & Simpan"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
              i < current
                ? "bg-primary border-primary text-primary-foreground"
                : i === current
                  ? "border-primary text-primary bg-background"
                  : "border-muted-foreground/30 text-muted-foreground bg-background",
            )}>
              {i < current ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={cn(
              "text-xs whitespace-nowrap",
              i === current ? "text-primary font-medium" : "text-muted-foreground",
            )}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 mx-2 mt-[-12px]",
              i < current ? "bg-primary" : "bg-muted-foreground/20",
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── wizard dialog ────────────────────────────────────────────────────────────

interface WizardDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function WizardDialog({ open, onClose, onSaved }: WizardDialogProps) {
  const { user } = useAuth();
  const { customers } = useCustomers();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 state
  const [customerId, setCustomerId] = useState("");
  const [picName, setPicName] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [serviceLocation, setServiceLocation] = useState("Lab Kemika, Tangerang");
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");

  // Step 2 state
  const [instruments, setInstruments] = useState<InstrumentRow[]>([emptyInstrument()]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const handleCustomerChange = useCallback((id: string) => {
    setCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust) {
      setPicName(cust.pic ?? "");
      setPicPhone(cust.phone ?? "");
    }
  }, [customers]);

  const addInstrument = () => setInstruments((prev) => [...prev, emptyInstrument()]);

  const removeInstrument = (key: string) =>
    setInstruments((prev) => prev.filter((r) => r._key !== key));

  const updateInstrument = (key: string, field: keyof InstrumentRow, value: string) =>
    setInstruments((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    );

  // Validation
  const step1Valid = customerId !== "" && receivedDate !== "";
  const step2Valid = instruments.length > 0 && instruments.every((i) => i.instrument_name.trim() !== "");

  const totalValue = instruments.reduce((sum, i) => sum + (parseFloat(i.unit_price) || 0), 0);

  const handleNext = () => {
    if (step === 0 && !step1Valid) {
      toast.error("Pilih customer dan isi tanggal penerimaan");
      return;
    }
    if (step === 1 && !step2Valid) {
      toast.error("Isi nama alat untuk semua baris, atau hapus baris kosong");
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const handleSave = async () => {
    setSaving(true);
    const instrumentInputs: CalibrationInstrumentInput[] = instruments.map((i) => ({
      instrument_name: i.instrument_name.trim(),
      brand_model: i.brand_model.trim(),
      serial_number: i.serial_number.trim(),
      measurement_range: i.measurement_range.trim(),
      calibration_method: i.calibration_method.trim(),
      unit_price: parseFloat(i.unit_price) || 0,
      sla_working_days: parseInt(i.sla_working_days) || 5,
    }));

    const result = await createCalibrationReceipt(
      {
        customer_id: customerId,
        service_pic_name: picName.trim(),
        service_pic_phone: picPhone.trim(),
        service_location: serviceLocation.trim() || "Lab Kemika, Tangerang",
        received_date: receivedDate,
        target_completion_date: targetDate,
        customer_request_notes: notes.trim(),
        created_by: user?.id ?? null,
      },
      instrumentInputs
    );

    setSaving(false);

    if (result.success) {
      toast.success(`Tanda terima ${result.receipt_number} berhasil disimpan`);
      onSaved();
      handleReset();
    } else {
      toast.error(result.error ?? "Gagal menyimpan");
    }
  };

  const handleReset = () => {
    setStep(0);
    setCustomerId("");
    setPicName("");
    setPicPhone("");
    setServiceLocation("Lab Kemika, Tangerang");
    setReceivedDate(todayISO());
    setTargetDate("");
    setNotes("");
    setInstruments([emptyInstrument()]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Terima Alat Kalibrasi
          </DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} />

        {/* Step 1 — Info Penerimaan */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label>Customer <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  options={customers
                    .filter((c) => c.is_active)
                    .map((c) => ({ value: c.id, label: c.name, description: c.code }))}
                  value={customerId}
                  onValueChange={handleCustomerChange}
                  placeholder="Cari customer..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>PIC Customer</Label>
                <Input
                  value={picName}
                  onChange={(e) => setPicName(e.target.value)}
                  placeholder="Nama PIC"
                />
              </div>
              <div className="space-y-1.5">
                <Label>No. HP PIC</Label>
                <Input
                  value={picPhone}
                  onChange={(e) => setPicPhone(e.target.value)}
                  placeholder="No. HP PIC"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Lokasi Kalibrasi</Label>
                <Input
                  value={serviceLocation}
                  onChange={(e) => setServiceLocation(e.target.value)}
                  placeholder="Lab Kemika, Tangerang"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal Terima <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Target Selesai</Label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label>Catatan Customer</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Permintaan khusus, kondisi alat saat diterima, dll."
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Daftar Alat */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">No.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[160px]">Nama Alat <span className="text-destructive">*</span></th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Merk/Model</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[110px]">No. Seri</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Range Ukur</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[130px]">Metode Kalibrasi</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Harga (Rp)</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">SLA</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {instruments.map((row, idx) => (
                    <tr key={row._key} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 text-muted-foreground text-center">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          value={row.instrument_name}
                          onChange={(e) => updateInstrument(row._key, "instrument_name", e.target.value)}
                          placeholder="Nama alat"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          value={row.brand_model}
                          onChange={(e) => updateInstrument(row._key, "brand_model", e.target.value)}
                          placeholder="Merk/Model"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          value={row.serial_number}
                          onChange={(e) => updateInstrument(row._key, "serial_number", e.target.value)}
                          placeholder="S/N"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          value={row.measurement_range}
                          onChange={(e) => updateInstrument(row._key, "measurement_range", e.target.value)}
                          placeholder="Range"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          value={row.calibration_method}
                          onChange={(e) => updateInstrument(row._key, "calibration_method", e.target.value)}
                          placeholder="Metode"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          min="0"
                          value={row.unit_price}
                          onChange={(e) => updateInstrument(row._key, "unit_price", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm w-16"
                          type="number"
                          min="1"
                          value={row.sla_working_days}
                          onChange={(e) => updateInstrument(row._key, "sla_working_days", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeInstrument(row._key)}
                          disabled={instruments.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={addInstrument} className="gap-1.5">
                <Plus className="w-4 h-4" /> Tambah Alat
              </Button>
              <div className="text-sm text-muted-foreground">
                {instruments.length} alat · Total: <span className="font-semibold text-foreground">{formatRupiah(totalValue)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Customer info summary */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Info Penerimaan</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div className="text-muted-foreground">Customer</div>
                <div className="font-medium">{selectedCustomer?.name ?? "-"}</div>
                <div className="text-muted-foreground">PIC</div>
                <div>{picName || "-"}</div>
                <div className="text-muted-foreground">No. HP PIC</div>
                <div>{picPhone || "-"}</div>
                <div className="text-muted-foreground">Lokasi</div>
                <div>{serviceLocation || "-"}</div>
                <div className="text-muted-foreground">Tgl Terima</div>
                <div>{receivedDate ? format(new Date(receivedDate + "T00:00:00"), "dd MMMM yyyy", { locale: idLocale }) : "-"}</div>
                <div className="text-muted-foreground">Target Selesai</div>
                <div>{targetDate ? format(new Date(targetDate + "T00:00:00"), "dd MMMM yyyy", { locale: idLocale }) : "-"}</div>
                {notes && (
                  <>
                    <div className="text-muted-foreground">Catatan</div>
                    <div className="text-muted-foreground/80">{notes}</div>
                  </>
                )}
              </div>
            </div>

            {/* Instruments summary */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">No.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nama Alat</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Merk/Model</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">No. Seri</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Harga</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {instruments.map((row, idx) => (
                    <tr key={row._key} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.instrument_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.brand_model || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.serial_number || "-"}</td>
                      <td className="px-3 py-2 text-right">{formatRupiah(parseFloat(row.unit_price) || 0)}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{row.sla_working_days} hr</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-right">Total</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatRupiah(totalValue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 border-t mt-4">
          <Button variant="outline" onClick={step === 0 ? handleClose : handleBack}>
            {step === 0 ? "Batal" : "Kembali"}
          </Button>
          <div className="flex gap-2">
            {step < 2 ? (
              <Button onClick={handleNext} className="gap-1.5">
                Lanjut <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving} className="gap-1.5 min-w-[120px]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function PenerimaanKalibrasi() {
  const { receipts, loading, refetch } = useCalibrationReceipts();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = receipts.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.receipt_number.toLowerCase().includes(q) ||
      (r.customer?.name ?? "").toLowerCase().includes(q)
    );
  });

  const totalInstruments = (r: CalibrationReceiptRow) => r.instruments?.length ?? 0;
  const totalValue = (r: CalibrationReceiptRow) =>
    (r.instruments ?? []).reduce((sum, i) => sum + (i.unit_price ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Penerimaan Kalibrasi</h1>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Terima Alat Baru
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nomor / customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">No. KAL</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tgl Terima</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Alat</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Target Selesai</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ClipboardList className="w-10 h-10 opacity-20" />
                      <p className="text-sm">
                        {search ? "Tidak ada hasil untuk pencarian ini" : "Belum ada penerimaan kalibrasi"}
                      </p>
                      {!search && (
                        <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)} className="mt-2 gap-1.5">
                          <Plus className="w-4 h-4" /> Terima Alat Pertama
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-primary">{r.receipt_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.received_date
                        ? format(new Date(r.received_date + "T00:00:00"), "dd MMM yyyy", { locale: idLocale })
                        : "-"}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.customer?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {totalInstruments(r)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatRupiah(totalValue(r))}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.target_completion_date
                        ? format(new Date(r.target_completion_date + "T00:00:00"), "dd MMM yyyy", { locale: idLocale })
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer when there's data */}
      {!loading && filtered.length > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          {filtered.length} tanda terima ditampilkan
        </div>
      )}

      <WizardDialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={() => { setWizardOpen(false); refetch(); }}
      />
    </div>
  );
}
