"use client";

interface Props {
  title: string;
  body: string;
  status?: "idle" | "warning" | "critical";
}

export default function MobileNotificationPreview({
  title,
  body,
  status = "idle",
}: Props) {
  const tone =
    status === "critical"
      ? "border-red-300/25 bg-red-500/10 text-red-100"
      : status === "warning"
        ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
        : "border-cyan-300/20 bg-cyan-400/8 text-cyan-100";

  return (
    <div className={`rounded-2xl border p-3 shadow-xl shadow-black/25 ${tone}`}>
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] opacity-75">
        Vista previa notificacion
      </p>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-85">{body}</p>
    </div>
  );
}
