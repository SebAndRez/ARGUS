import type { FenixInstitutionalAccessLevel } from "@/types/fenix";

export default function FenixAccessBadge({
  accessLevel,
}: {
  accessLevel: FenixInstitutionalAccessLevel;
}) {
  return (
    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-100">
      {accessLevel === "institutional" ? "Institucional" : "Publico"}
    </span>
  );
}
