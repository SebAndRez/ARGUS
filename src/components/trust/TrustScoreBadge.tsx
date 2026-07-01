import type { TrustBand } from "@/types/trustAchievements";

const bandLabels: Record<TrustBand, string> = {
  NEW: "Nuevo",
  LOW: "Baja confianza",
  NORMAL: "Normal",
  TRUSTED: "Confiable",
  HIGH_TRUST: "Alta confianza",
  WATCHLIST: "En observacion",
  LIMITED: "Limitado",
};

export default function TrustScoreBadge({
  score,
  band,
}: {
  score: number;
  band: TrustBand;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase text-cyan-100">
      Credibilidad ARGUS {Math.round(score)}
      <span className="text-slate-400">·</span>
      {bandLabels[band]}
    </span>
  );
}
