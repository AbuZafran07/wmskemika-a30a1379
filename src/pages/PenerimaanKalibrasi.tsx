import { ClipboardList } from "lucide-react";

export default function PenerimaanKalibrasi() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
      <ClipboardList className="w-16 h-16 opacity-30" />
      <h1 className="text-2xl font-semibold text-foreground">Penerimaan Kalibrasi</h1>
      <p className="text-sm">Modul penerimaan alat kalibrasi — segera hadir</p>
    </div>
  );
}
