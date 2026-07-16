"use client";

interface Props {
  onOpenFenix?: () => void;
}

const fenixCapabilities = [
  "Simular evacuacion",
  "Predecir zonas afectadas",
  "Calcular rutas",
  "Estimar poblacion expuesta",
  "Analizar refugios",
  "Generar plan de accion",
];

export default function FenixTwinModulePanel({ onOpenFenix }: Props) {
  return (
    <section className="argus-module-panel">
      <header className="argus-module-panel-header">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Capa avanzada / institucional
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">ARGUS Fenix Twin</h2>
          <p className="mt-1 text-xs text-slate-400">
            Simulacion y planificacion de evacuacion.
          </p>
        </div>
        <span className="argus-module-badge">Institucional</span>
      </header>
      <div className="argus-module-panel-body">
        <div className="grid gap-2">
          {fenixCapabilities.map((item) => (
            <div key={item} className="argus-module-section">
              {item}
            </div>
          ))}
        </div>
        <p className="rounded border border-cyan-300/15 bg-cyan-400/8 p-3 text-xs leading-5 text-cyan-100">
          Vista publica: ARGUS mostrara instrucciones simples de ruta y
          seguridad cuando exista informacion suficiente.
        </p>
        <p className="rounded border border-amber-300/15 bg-amber-400/8 p-3 text-xs leading-5 text-amber-100">
          Capa institucional: simulaciones avanzadas, rutas criticas, refugios y
          mando operativo. Demo no reemplaza instrucciones oficiales.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <a
            href="/modules/fenix"
            onClick={onOpenFenix}
            className="border border-cyan-300/25 bg-cyan-400/12 px-3 py-2 text-center text-xs font-bold uppercase text-cyan-100"
          >
            Abrir Fenix
          </a>
          <a
            href="/modules/fenix"
            className="border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs font-bold uppercase text-slate-200"
          >
            Ver demo
          </a>
          <button
            type="button"
            className="border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase text-slate-400"
          >
            Solicitar capa
          </button>
        </div>
      </div>
    </section>
  );
}
