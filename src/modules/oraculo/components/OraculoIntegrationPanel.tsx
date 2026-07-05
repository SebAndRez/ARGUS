interface Props {
  onSendToTalos: () => void;
  onSendToAtlas: () => void;
  canSend: boolean;
  talosPacketCount: number;
  fenixPacketCount: number;
}

const integrations = [
  { module: "ATLAS", detail: "Resumen de fuentes/evidencia/contradicciones para el centro de mando." },
  { module: "VIGÍA", detail: "Reportes ciudadanos confirmados se convierten en evidencia interna." },
  { module: "TALOS", detail: "Evidencia verificada, con ubicación y sin contradicciones críticas, lista para riesgo avanzado." },
  { module: "FÉNIX", detail: "Evidencia histórica/contextual limpia, preparada para escenarios futuros (sin simular)." },
];

export default function OraculoIntegrationPanel({
  onSendToTalos,
  onSendToAtlas,
  canSend,
  talosPacketCount,
  fenixPacketCount,
}: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">
        Integraciones preparadas
      </h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {integrations.map((integration) => (
          <div key={integration.module} className="border border-white/10 bg-white/[0.02] p-2.5">
            <p className="text-xs font-bold uppercase text-violet-200">{integration.module}</p>
            <p className="mt-1 text-[0.65rem] text-slate-400">{integration.detail}</p>
          </div>
        ))}
      </div>

      {canSend && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSendToTalos}
            className="border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-fuchsia-100"
          >
            Recalcular severidad con TALOS ({talosPacketCount})
          </button>
          <button
            type="button"
            onClick={onSendToAtlas}
            className="border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-cyan-100"
          >
            Enviar resumen a ATLAS
          </button>
          <span className="text-[0.6rem] text-slate-500">{fenixPacketCount} paquetes preparados para FÉNIX (histórico)</span>
        </div>
      )}
    </section>
  );
}
