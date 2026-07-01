"use client";

export default function MobileNotificationPreview() {
  return (
    <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-3 text-violet-100">
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] opacity-75">
        Notificacion futura
      </p>
      <p className="mt-2 text-sm font-semibold">ARGUS detecto posible accidente</p>
      <p className="mt-1 text-xs leading-5 opacity-85">
        ¿Estas bien? Responder ahora: Estoy bien / Necesito ayuda.
      </p>
      <p className="mt-2 text-[0.62rem] leading-4 text-violet-100/75">
        Las notificaciones reales requieren app movil nativa con FCM/APNs.
      </p>
    </div>
  );
}
