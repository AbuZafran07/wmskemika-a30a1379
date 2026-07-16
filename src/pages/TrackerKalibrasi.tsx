import React from "react";
import { FlaskConical } from "lucide-react";

export default function TrackerKalibrasi() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4 text-center">
      <FlaskConical className="h-12 w-12 text-muted-foreground/40" />
      <div>
        <h1 className="text-2xl font-bold">Tracker Kalibrasi</h1>
        <p className="text-muted-foreground mt-1">Calibration Service Tracker — Coming Soon</p>
      </div>
    </div>
  );
}
