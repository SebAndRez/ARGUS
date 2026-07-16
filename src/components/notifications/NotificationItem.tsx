"use client";

import type { ArgusNotification } from "@/types/notificationCenter";
import {
  getNotificationCategoryClasses,
  getNotificationSeverityClasses,
  notificationCategoryLabels,
  notificationTypeLabels,
  severityLabels,
  verificationStatusLabels,
} from "@/lib/notifications/notificationVisuals";

interface NotificationItemProps {
  notification: ArgusNotification;
  onOpen: (notification: ArgusNotification) => void;
}

function formatRelativeTime(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "fecha no disponible";
  const diffMs = Date.now() - time;
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function formatDistance(value: number | null) {
  if (value === null) return null;
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

export default function NotificationItem({
  notification,
  onOpen,
}: NotificationItemProps) {
  const secondaryAction = notification.actions.find((action) => !action.primary);
  const distance = formatDistance(notification.distanceKm);

  return (
    <article
      className={`border p-3 shadow-lg ${getNotificationSeverityClasses(notification.severity)} ${
        notification.isRead ? "opacity-70" : ""
      }`}
    >
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-current/25 bg-slate-950/60 text-[0.66rem] font-black">
          {notification.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="border border-current/20 bg-slate-950/35 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase">
              {severityLabels[notification.severity]}
            </span>
            {/*
              Category badge — the primary "what is this" signal (Prompt 11
              §14-§16). Distinct from severity (color, badge above) and from
              verification (border-only indicator below): text-based so it
              never depends on color alone, and never shares a label with a
              different category.
            */}
            <span
              className={`border bg-slate-950/35 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase ${getNotificationCategoryClasses(
                notification.category
              )}`}
            >
              {notificationCategoryLabels[notification.category]}
            </span>
            <span className="border border-white/10 bg-slate-950/35 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase text-slate-300">
              {notification.scope}
            </span>
            <span className="border border-white/10 bg-slate-950/35 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase text-slate-300">
              {notification.status}
            </span>
            {!notification.isRead && (
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" aria-label="No leida" />
            )}
          </div>
          {notification.verificationStatus && (
            <p className="mt-1 border-l-2 border-current/30 pl-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.06em] text-slate-500">
              {verificationStatusLabels[notification.verificationStatus]}
            </p>
          )}
          <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-white">
            {notification.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">
            {notification.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <span>{formatRelativeTime(notification.eventTime)}</span>
            <span>{notificationTypeLabels[notification.type]}</span>
            <span>{notification.sourceName}</span>
            <span>{notification.confidence}% conf.</span>
            {distance && <span>{distance}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpen(notification)}
              className="min-h-9 border border-cyan-300/30 bg-cyan-400/12 px-3 text-xs font-bold uppercase text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Ir al mapa
            </button>
            {secondaryAction && (
              <a
                href={secondaryAction.url}
                className="inline-flex min-h-9 items-center border border-white/10 bg-white/[0.04] px-3 text-xs font-bold uppercase text-slate-200 transition hover:border-white/25"
              >
                {secondaryAction.label}
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
