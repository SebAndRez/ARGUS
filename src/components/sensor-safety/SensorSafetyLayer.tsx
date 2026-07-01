"use client";

import SensorSafetyMarker from "@/components/sensor-safety/SensorSafetyMarker";
import type { SensorSafetyCheckIn } from "@/types/sensorSafety";

export default function SensorSafetyLayer({ checkIns }: { checkIns: SensorSafetyCheckIn[] }) {
  if (checkIns.length === 0) return null;
  return (
    <section className="rounded border border-orange-300/20 bg-slate-950/85 p-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-orange-300">
        Safety Checks
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {checkIns.slice(0, 4).map((checkIn) => (
          <SensorSafetyMarker key={checkIn.id} checkIn={checkIn} />
        ))}
      </div>
    </section>
  );
}
