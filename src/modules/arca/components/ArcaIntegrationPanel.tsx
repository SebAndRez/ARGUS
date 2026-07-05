const integrations = [
  { module: "HERMES", detail: "Rutas hacia refugios candidatos (preparado, sin routing real)." },
  { module: "TALOS", detail: "Zonas de riesgo que aumentan demanda de refugio." },
  { module: "VIGÍA", detail: "Reportes ciudadanos sobre refugio lleno, sin agua, cerrado, etc." },
  { module: "ORÁCULO", detail: "Evidencia institucional/externa sobre estado de refugios." },
  { module: "AURA", detail: "Refugios con punto médico o que requieren derivación sanitaria." },
  { module: "NEXUS", detail: "Demanda de suministros abierta (sin inventario real)." },
  { module: "FÉNIX", detail: "Capacidad/ocupación/distribución para futuras simulaciones (sin simular)." },
  { module: "ATLAS", detail: "Resumen operacional de refugios para el centro de mando." },
];

export default function ArcaIntegrationPanel() {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Integraciones preparadas</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {integrations.map((integration) => (
          <div key={integration.module} className="border border-white/10 bg-white/[0.02] p-2.5">
            <p className="text-xs font-bold uppercase text-emerald-200">{integration.module}</p>
            <p className="mt-1 text-[0.65rem] text-slate-400">{integration.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
