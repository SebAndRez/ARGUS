import type { AtlasDecisionLogItem } from "@/modules/atlas/types";
import { atlasSeverityTone, formatRelativeTime } from "@/modules/atlas/utils";

interface Props {
  items: AtlasDecisionLogItem[];
  isDemoData: boolean;
}

/**
 * Bitácora operacional de ATLAS. Cuando hay registros reales de
 * `/api/audit/logs` (`src/services/auditService.ts` + `prisma.AuditLog`) se
 * muestran esos; si no hay suficientes, se completa con la bitácora demo
 * tipada (`atlasDemoDecisionLog`), marcada explícitamente como tal.
 */
export default function AtlasDecisionLog({ items, isDemoData }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-4 shadow-xl shadow-black/25">
      <header className="flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Bitácora de decisiones
        </h2>
        {isDemoData && (
          <span className="border border-amber-300/25 bg-amber-400/8 px-2 py-0.5 text-[0.58rem] font-bold uppercase text-amber-100">
            Demo
          </span>
        )}
      </header>
      <ul className="mt-3 space-y-2">
        {items.length === 0 && (
          <li className="text-xs text-slate-500">Sin actividad reciente registrada.</li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-xs last:border-0 last:pb-0"
          >
            <span className="text-slate-200">
              <span className="font-semibold text-white">{item.actor}</span> — {item.action}
            </span>
            <span className="flex items-center gap-2 text-[0.6rem] text-slate-500">
              {item.module && <span className="uppercase tracking-[0.08em]">{item.module}</span>}
              {item.severity && (
                <span className={`border px-1.5 py-0.5 font-bold uppercase ${atlasSeverityTone[item.severity]}`}>
                  {item.severity}
                </span>
              )}
              {formatRelativeTime(item.timestamp)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
