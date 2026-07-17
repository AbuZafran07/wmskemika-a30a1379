import { FlaskConical } from "lucide-react";

export default function TrackerKalibrasi() {
  const columns = [
    { label: "In Progress", desc: "Fisik diterima, SPK aktif" },
    { label: "Completed", desc: "Semua alat selesai dikalibrasi" },
    { label: "Invoiced", desc: "Invoice dikirim ke customer" },
    { label: "Selesai", desc: "Pembayaran lunas" },
  ];

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold">Tracker Kalibrasi</h1>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.label} className="rounded-xl border bg-muted/40 p-4 min-h-[300px]">
            <div className="font-semibold text-sm mb-1">{col.label}</div>
            <div className="text-xs text-muted-foreground mb-4">{col.desc}</div>
            <div className="flex items-center justify-center h-40 text-xs text-muted-foreground/50">
              Segera hadir
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
