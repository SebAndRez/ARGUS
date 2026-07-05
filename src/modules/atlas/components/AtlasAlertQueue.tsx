import type { AtlasAlertQueueItem } from "@/modules/atlas/types";
import { formatRelativeTime } from "@/modules/atlas/utils";

const levelTone: Record<AtlasAlertQueueItem["level"], string> = {
  critical: "border-red-400/40 bg-red-500/12 text-red-100",
  high: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  info: "border-cyan-300/25 bg-cyan-400/8 text-cyan-100",
};

const levelLabel: Record<AtlasAlertQueueItem["level"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  info: "Informativa",
};

interface Props {
  alerts: AtlasAlertQueueItem[];
}

export default function AtlasAlertQueue({ alerts }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Cola de alertas
        </h2>
        <span className="text-[0.6rem] text-slate-500">{alerts.length} priorizadas</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {alerts.length === 0 && (
          <p className="text-xs text-slate-500">Sin alertas de alta prioridad en este momento.</p>
        )}
        {alerts.map((alert) => (
          <div key={alert.id} className={`border p-2.5 ${levelTone[alert.level]}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">{alert.title}</p>
              <span className="shrink-0 text-[0.55rem] font-bold uppercase opacity-80">
                {levelLabel[alert.level]}
              </span>
            </div>
            <p className="mt-1 text-[0.62rem] opacity-70">
              {formatRelativeTime(alert.occurredAt)}
              {alert.relatedModule ? ` · ${alert.relatedModule}` : ""}
            </p>
            <p className="mt-1 text-[0.62rem] opacity-80">{alert.suggestedAction}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
