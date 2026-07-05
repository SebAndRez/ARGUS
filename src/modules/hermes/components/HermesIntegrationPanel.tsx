const integrations = [
  { module: "TALOS", detail: "Zonas de riesgo (crítico → evitar, alto → precaución, medio → advertencia)." },
  { module: "VIGÍA", detail: "Reportes ciudadanos de corte de ruta, accidente, inundación, derrumbe e incendio." },
  { module: "ORÁCULO", detail: "Evidencia externa que confirma o contradice bloqueos." },
  { module: "ARCA", detail: "Rutas hacia refugios (preparado, sin gestión real de capacidad)." },
  { module: "AURA", detail: "Rutas hacia puntos médicos (sin exponer datos médicos personales)." },
  { module: "NEXUS", detail: "Rutas logísticas (preparado, sin inventario real)." },
  { module: "FÉNIX", detail: "Candidatas de ruta y datos faltantes para futuras simulaciones (sin simular)." },
  { module: "ATLAS", detail: "Resumen de rutas/bloqueos para el centro de mando." },
];

export default function HermesIntegrationPanel() {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Integraciones preparadas</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {integrations.map((integration) => (
          <div key={integration.module} className="border border-white/10 bg-white/[0.02] p-2.5">
            <p className="text-xs font-bold uppercase text-teal-200">{integration.module}</p>
            <p className="mt-1 text-[0.65rem] text-slate-400">{integration.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
