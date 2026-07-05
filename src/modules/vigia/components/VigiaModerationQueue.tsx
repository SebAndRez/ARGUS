import type { VigiaReport } from "@/modules/vigia/types";
import { flagPotentiallySensitiveReport, vigiaModerationFlagLabel } from "@/modules/vigia/vigiaModeration";
import { vigiaReportTypeLabel } from "@/modules/vigia/utils";

interface Props {
  reports: VigiaReport[];
}

export default function VigiaModerationQueue({ reports }: Props) {
  const flagged = reports
    .map((report) => ({ report, flags: flagPotentiallySensitiveReport(report) }))
    .filter((item) => item.flags.length > 0);

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
        Cola de moderación
      </h2>
      {flagged.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Sin reportes marcados para revisión.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {flagged.map(({ report, flags }) => (
            <li key={report.id} className="border border-amber-300/20 bg-amber-400/5 p-2.5">
              <p className="text-xs font-semibold text-amber-100">
                {report.title || vigiaReportTypeLabel[report.type]}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {flags.map((flag) => (
                  <span key={flag} className="border border-amber-300/25 px-1.5 py-0.5 text-[0.58rem] uppercase text-amber-200">
                    {vigiaModerationFlagLabel[flag] ?? flag}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
