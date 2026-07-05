"use client";

interface NotificationCenterButtonProps {
  unreadCount: number;
  criticalCount: number;
  open: boolean;
  onClick: () => void;
}

export default function NotificationCenterButton({
  unreadCount,
  criticalCount,
  open,
  onClick,
}: NotificationCenterButtonProps) {
  const count = criticalCount || unreadCount;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`argus-notification-button pointer-events-auto fixed z-[56] inline-flex min-h-11 items-center gap-2 border px-3 text-xs font-bold uppercase tracking-[0.12em] shadow-xl shadow-black/35 backdrop-blur-xl transition ${
        open
          ? "border-cyan-200/55 bg-cyan-400/15 text-cyan-50"
          : "border-cyan-300/25 bg-slate-950/92 text-cyan-100 hover:border-cyan-200/55"
      }`}
      aria-label="Abrir ARGUS Notification Center"
      aria-pressed={open}
      title="ARGUS Notification Center"
    >
      <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200/30 bg-slate-900/80 text-sm">
        !
        {count > 0 && (
          <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full border border-slate-950 bg-red-500 px-1 text-[0.58rem] leading-4 text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="hidden sm:inline">Alertas</span>
    </button>
  );
}
