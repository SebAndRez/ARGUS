import type { MedicalPoint } from "@/types/medical";

export default function MedicalPointMarker({ point }: { point: MedicalPoint }) {
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200/60 bg-rose-500 text-[0.58rem] font-black text-white shadow-lg shadow-rose-950/30"
      title={point.name}
    >
      M
    </span>
  );
}
