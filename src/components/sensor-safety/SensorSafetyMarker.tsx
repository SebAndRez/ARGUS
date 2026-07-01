"use client";

import type { SensorSafetyCheckIn } from "@/types/sensorSafety";

export default function SensorSafetyMarker({ checkIn }: { checkIn: SensorSafetyCheckIn }) {
  const label =
    checkIn.status === "USER_SAFE"
      ? "OK"
      : checkIn.status === "NEED_HELP" || checkIn.status === "ESCALATED"
        ? "HELP"
        : "SAFE";
  return (
    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-orange-300/40 bg-orange-400/20 px-2 text-[0.6rem] font-black text-orange-50">
      {label}
    </span>
  );
}
