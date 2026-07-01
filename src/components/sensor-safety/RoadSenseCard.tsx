"use client";

export default function RoadSenseCard({ onDemo }: { onDemo: () => void }) {
  return (
    <Card title="RoadSense" status="Requiere app movil / Demo web">
      <p>Detecta patrones compatibles con choque, frenada extrema o vuelco usando sensores del telefono en app movil nativa.</p>
      <p className="text-amber-100">Deteccion preliminar, no confirmacion de accidente.</p>
      <button onClick={onDemo} className="argus-safety-demo-button" type="button">
        Simular posible accidente
      </button>
    </Card>
  );
}

export function Card({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-white/10 bg-slate-900/65 p-3 text-xs leading-5 text-slate-300">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[0.55rem] font-bold uppercase text-violet-100">
          {status}
        </span>
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}
