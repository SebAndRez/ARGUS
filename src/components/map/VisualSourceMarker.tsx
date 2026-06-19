import type { VisualSource } from "@/types/visualSource";

interface Props {
  source: VisualSource;
  isSelected?: boolean;
}

const categoryStyles: Record<VisualSource["category"], string> = {
  governmental_osint: "border-red-200/70 bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.35)]",
  institutional_camera: "border-red-200/70 bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.35)]",
  open_public_camera:
    "border-purple-200/70 bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]",
  commercial_webcam:
    "border-purple-200/70 bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]",
  media_stream: "border-purple-200/70 bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]",
  citizen_stream: "border-purple-200/70 bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]",
  argus_verified_sensor:
    "border-cyan-100/80 bg-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.4)]",
  unverified_source:
    "border-amber-100/70 bg-amber-400 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.3)]",
};

export default function VisualSourceMarker({ source, isSelected = false }: Props) {
  const isOffline = source.status === "offline";

  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded-lg border-2 ${
        isOffline ? "border-slate-400/60 bg-slate-600 text-slate-100" : categoryStyles[source.category]
      } ${isSelected ? "scale-110 ring-2 ring-white/90 ring-offset-2 ring-offset-slate-950" : ""}`}
    >
      <span className="text-[0.58rem] font-black tracking-normal" aria-hidden="true">
        CAM
      </span>
      <span
        className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${
          source.status === "live" ? "bg-emerald-400" : source.status === "offline" ? "bg-slate-400" : "bg-amber-300"
        }`}
      />
    </div>
  );
}
