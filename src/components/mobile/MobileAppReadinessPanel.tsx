const readinessRows = [
  ["Web/PWA", "Parcial", "Mapa, SOS, reportes, modulos demo y manifest basico."],
  ["Android native", "Preparado", "Requiere app nativa, Foreground Service, FCM, sensores y permisos."],
  ["iOS native", "Pendiente", "Core Motion y APNs con limitaciones fuertes de background."],
  ["Push real", "No activo", "Solo payload preview; falta FCM/APNs y consentimiento."],
  ["Offline queue", "Contrato", "Falta implementacion nativa cifrada y reintentos."],
  ["Privacidad", "Pendiente fuerte", "RLS, consentimiento versionado, borrado/exportacion."],
];

export default function MobileAppReadinessPanel() {
  return (
    <section className="rounded-lg border border-violet-300/15 bg-slate-950/86 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-violet-300/80">
            Android-first
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">Mobile Safety readiness</h3>
        </div>
        <a
          href="/api/mobile/push/preview"
          className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Push preview
        </a>
      </header>
      <div className="mt-3 grid gap-2">
        {readinessRows.map(([label, status, detail]) => (
          <div key={label} className="rounded border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{label}</p>
              <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[0.56rem] font-bold uppercase text-violet-100">
                {status}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api/mobile/device/register" className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-400">
          Device API
        </a>
        <a href="/api/mobile/events" className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-400">
          Events API
        </a>
      </div>
    </section>
  );
}
