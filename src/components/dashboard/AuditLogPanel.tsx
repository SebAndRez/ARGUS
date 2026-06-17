"use client";

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
}

interface Props {
  logs: AuditLogItem[];
}

export default function AuditLogPanel({ logs }: Props) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-slate-950/85 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/75">Auditoría</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Últimos eventos</h2>
        </div>
        <span className="rounded-2xl bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">{logs.length}</span>
      </div>
      <div className="space-y-3 text-sm text-slate-200">
        {logs.slice(0, 6).map((log) => (
          <div key={log.id} className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-white">{log.action}</p>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-slate-300">{log.targetType}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">ID objetivo: {log.targetId ?? "N/A"}</p>
            <p className="mt-2 text-xs text-slate-400">{new Date(log.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
