import AchievementGrid from "@/components/trust/AchievementGrid";
import TrustExplanation from "@/components/trust/TrustExplanation";
import TrustProgressBar from "@/components/trust/TrustProgressBar";
import TrustScoreBadge from "@/components/trust/TrustScoreBadge";
import type { TrustAchievementProfile } from "@/types/trustAchievements";

export default function UserTrustProfileCard({
  profile,
}: {
  profile: TrustAchievementProfile;
}) {
  const { summary } = profile;
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-950/90 p-4 shadow-2xl shadow-black/30">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-cyan-300">
            ARGUS Trust & Achievements
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {summary.publicAlias}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {summary.verifiedIdentity
              ? "Cuenta con identidad verificada"
              : "Identidad no verificada publicamente"}
          </p>
        </div>
        <TrustScoreBadge score={summary.trustScore} band={summary.trustBand} />
      </header>

      <div className="mt-4">
        <TrustProgressBar value={summary.trustScore} />
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
        <Stat label="Confirmados" value={summary.confirmedReports} />
        <Stat label="Descartados" value={summary.rejectedReports} />
        <Stat label="Medallas" value={summary.achievementsUnlocked} />
        <Stat label="Nivel max." value={summary.highestAchievementLevel} />
      </div>

      <div className="mt-4">
        <TrustExplanation />
      </div>

      <div className="mt-5">
        <AchievementGrid
          definitions={profile.definitions}
          achievements={profile.achievements}
        />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[0.56rem] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
