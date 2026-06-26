"use client";

interface Props {
  onOpenAura?: () => void;
}

const basicItems = [
  "Boton medico",
  "Grupo sanguineo opcional",
  "Alergias opcionales",
  "Contacto de emergencia",
  "Punto medico cercano",
];

const proItems = [
  "Triage",
  "Ambulancias",
  "Camas disponibles",
  "Stock medico",
  "Traslado",
  "Mando sanitario",
];

export default function AuraMedicModulePanel({ onOpenAura }: Props) {
  return (
    <section className="argus-module-panel">
      <header className="argus-module-panel-header">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-rose-300">
            Basico ARGUS + capa profesional
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">AURA Medic Mesh</h2>
          <p className="mt-1 text-xs text-slate-400">
            Red medica y respuesta sanitaria.
          </p>
        </div>
        <span className="argus-module-badge">AURA Basic</span>
      </header>
      <div className="argus-module-panel-body">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[0.6rem] font-bold uppercase text-slate-500">
              Basico libre
            </p>
            <div className="grid gap-2">
              {basicItems.map((item) => (
                <div key={item} className="argus-module-section">{item}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[0.6rem] font-bold uppercase text-slate-500">
              Pro futuro
            </p>
            <div className="grid gap-2">
              {proItems.map((item) => (
                <div key={item} className="argus-module-section opacity-70">{item}</div>
              ))}
            </div>
          </div>
        </div>
        <p className="rounded border border-rose-300/15 bg-rose-400/8 p-3 text-xs leading-5 text-rose-100">
          ARGUS incluye datos medicos basicos de emergencia. La capa profesional
          de AURA esta pensada para instituciones, equipos medicos y mando
          sanitario. ARGUS no diagnostica ni recomienda tratamientos.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onOpenAura}
            className="border border-rose-300/25 bg-rose-400/12 px-3 py-2 text-xs font-bold uppercase text-rose-100"
          >
            Abrir AURA basico
          </button>
          <button
            type="button"
            className="border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase text-slate-300"
          >
            Ver capa pro
          </button>
          <button
            type="button"
            onClick={onOpenAura}
            className="border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase text-slate-300"
          >
            Contacto medico
          </button>
        </div>
      </div>
    </section>
  );
}
