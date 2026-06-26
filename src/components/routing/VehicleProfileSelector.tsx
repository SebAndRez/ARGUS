"use client";

import type { VehicleProfile } from "@/types/routing";

const profiles: VehicleProfile[] = [
  "pedestrian",
  "bicycle",
  "motorcycle",
  "car",
  "pickup",
  "four_by_four",
  "truck",
  "ambulance",
  "fire_truck",
  "rescue_team",
  "aid_logistics",
];

export default function VehicleProfileSelector({
  value,
  onChange,
}: {
  value: VehicleProfile;
  onChange: (value: VehicleProfile) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as VehicleProfile)}
      className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
    >
      {profiles.map((profile) => (
        <option key={profile} value={profile}>{profile}</option>
      ))}
    </select>
  );
}
