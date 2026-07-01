import type {
  AchievementDefinition,
  UserAchievement,
} from "@/types/trustAchievements";

export default function AchievementBadge({
  definition,
  achievement,
}: {
  definition: AchievementDefinition;
  achievement?: UserAchievement;
}) {
  const level = achievement?.level ?? 0;
  return (
    <div className="rounded border border-white/10 bg-slate-900/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 text-[0.62rem] font-black text-cyan-100">
          {definition.icon}
        </span>
        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-300">
          Nivel {level}/10
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{definition.name}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{definition.description}</p>
      <p className="mt-2 text-[0.6rem] font-bold uppercase text-slate-500">
        {definition.cosmeticOnly ? "Cosmetico" : "Puede aportar poco a trust"}
      </p>
    </div>
  );
}
