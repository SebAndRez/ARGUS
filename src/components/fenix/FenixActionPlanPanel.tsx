export type FenixActionPlanResponse = {
  planId: string;
  summary: string;
  immediateActions?: Array<{ id: string; text?: string; title?: string; description?: string }>;
  shortTermActions?: Array<{ id: string; text?: string; title?: string; description?: string }>;
  communicationActions?: string[];
  limitations?: string[];
  confidence?: number;
  isDemo?: boolean;
};

export default function FenixActionPlanPanel({ plan }: { plan: FenixActionPlanResponse | null }) {
  if (!plan) return null;
  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase text-white">Plan de acción</h3>
        <span className="text-xs font-bold text-cyan-200">{plan.confidence ?? "--"}%</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{plan.summary}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ActionList title="Acciones inmediatas" items={plan.immediateActions ?? []} />
        <ActionList title="Acciones 30 min / 1-3 h" items={plan.shortTermActions ?? []} />
      </div>
      <div className="mt-3 rounded border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-300">
        {(plan.communicationActions ?? []).map((item) => <p key={item}>{item}</p>)}
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-100">
        {(plan.limitations ?? []).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function ActionList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; text?: string; title?: string; description?: string }>;
}) {
  return (
    <div className="rounded border border-white/10 bg-slate-900/70 p-3">
      <p className="text-xs font-bold uppercase text-cyan-200">{title}</p>
      <div className="mt-2 grid gap-2">
        {items.length === 0 ? <p className="text-xs text-slate-500">Sin acciones específicas.</p> : null}
        {items.map((item) => (
          <p key={item.id} className="text-xs leading-5 text-slate-300">
            {item.text ?? item.title ?? item.description}
          </p>
        ))}
      </div>
    </div>
  );
}

