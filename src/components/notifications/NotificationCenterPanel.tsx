"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import NotificationEmptyState from "@/components/notifications/NotificationEmptyState";
import NotificationFilters, {
  type NotificationFilterState,
} from "@/components/notifications/NotificationFilters";
import NotificationItem from "@/components/notifications/NotificationItem";
import type {
  ArgusNotification,
  ArgusNotificationSummary,
} from "@/types/notificationCenter";

const READ_STORAGE_KEY = "argus-notification-read-ids";

interface NotificationCenterPanelProps {
  open: boolean;
  latitude: number;
  longitude: number;
  onClose: () => void;
  onOpenNotification: (notification: ArgusNotification) => void;
  onSummaryChange?: (summary: ArgusNotificationSummary) => void;
}

type ActiveTab = "all" | "near" | "world";

function readStoredIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStoredIds(ids: string[]) {
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids.slice(0, 500)));
  } catch {
    // localStorage can be unavailable in private mode.
  }
}

function summarize(notifications: ArgusNotification[]): ArgusNotificationSummary {
  return {
    total: notifications.length,
    unread: notifications.filter((item) => !item.isRead).length,
    critical: notifications.filter((item) => item.severity === "P0_CRITICAL").length,
    high: notifications.filter((item) => item.severity === "P1_HIGH").length,
    local: notifications.filter((item) => item.scope === "LOCAL").length,
    national: notifications.filter((item) => item.scope === "NATIONAL").length,
    international: notifications.filter((item) => item.scope === "INTERNATIONAL").length,
    global: notifications.filter((item) => item.scope === "GLOBAL").length,
    latestAt: notifications[0]?.eventTime ?? null,
  };
}

export default function NotificationCenterPanel({
  open,
  latitude,
  longitude,
  onClose,
  onOpenNotification,
  onSummaryChange,
}: NotificationCenterPanelProps) {
  const [tab, setTab] = useState<ActiveTab>("all");
  const [filters, setFilters] = useState<NotificationFilterState>({
    severity: "ALL",
    type: "ALL",
    sourceType: "ALL",
  });
  const [notifications, setNotifications] = useState<ArgusNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>(() => readStoredIds());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    const params = new URLSearchParams({
      lat: String(latitude),
      lng: String(longitude),
      includeGlobal: "true",
      limit: "120",
    });
    if (readIds.length) params.set("readIds", readIds.join(","));
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/notifications?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar alertas.");
      const nextNotifications = (data.notifications ?? []) as ArgusNotification[];
      setNotifications(nextNotifications);
      onSummaryChange?.(summarize(nextNotifications));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudieron cargar alertas.");
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude, onSummaryChange, readIds]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchNotifications();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [fetchNotifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (tab === "near" && notification.scope !== "LOCAL") return false;
      if (tab === "world" && !["GLOBAL", "INTERNATIONAL"].includes(notification.scope)) return false;
      if (filters.severity !== "ALL" && notification.severity !== filters.severity) return false;
      if (filters.type !== "ALL" && notification.type !== filters.type) return false;
      if (filters.sourceType !== "ALL" && notification.sourceType !== filters.sourceType) return false;
      return true;
    });
  }, [filters, notifications, tab]);

  const markIdsAsRead = useCallback(
    (ids: string[]) => {
      const nextIds = Array.from(new Set([...readIds, ...ids]));
      setReadIds(nextIds);
      writeStoredIds(nextIds);
      setNotifications((current) => {
        const next = current.map((notification) =>
          ids.includes(notification.id) ? { ...notification, isRead: true } : notification
        );
        onSummaryChange?.(summarize(next));
        return next;
      });
    },
    [onSummaryChange, readIds]
  );

  const openNotification = useCallback(
    (notification: ArgusNotification) => {
      markIdsAsRead([notification.id]);
      onOpenNotification({ ...notification, isRead: true });
    },
    [markIdsAsRead, onOpenNotification]
  );

  const markAllAsRead = useCallback(() => {
    markIdsAsRead(notifications.map((notification) => notification.id));
  }, [markIdsAsRead, notifications]);

  if (!open) return null;

  return (
    <aside className="argus-notification-panel pointer-events-auto fixed inset-x-2 bottom-2 top-24 z-[64] flex flex-col border border-cyan-300/20 bg-slate-950/96 shadow-2xl shadow-black/50 backdrop-blur-xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-28 sm:w-[430px]">
      <header className="border-b border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
              ARGUS Notification Center
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Alertas locales, nacionales e internacionales ordenadas por tiempo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 border border-white/10 bg-white/[0.04] text-sm font-bold text-slate-300 hover:border-white/25"
            aria-label="Cerrar Notification Center"
          >
            X
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 border border-white/10 bg-slate-900/50 p-1">
          {([
            ["all", "Todas"],
            ["near", "Cerca de mi"],
            ["world", "Mundo"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-8 text-[0.65rem] font-bold uppercase ${
                tab === key ? "bg-cyan-400/15 text-cyan-100" : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <NotificationFilters value={filters} onChange={setFilters} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[0.65rem] text-slate-500">
          <span>
            {filteredNotifications.length} visibles / {notifications.length} totales
          </span>
          <button
            type="button"
            onClick={markAllAsRead}
            className="min-h-8 border border-white/10 bg-white/[0.04] px-2 font-bold uppercase text-slate-300 hover:border-white/25"
          >
            Marcar todo como leido
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="border border-cyan-300/20 bg-cyan-400/10 p-3 text-xs text-cyan-100">
            Cargando alertas ARGUS...
          </div>
        )}
        {error && (
          <div className="border border-red-300/25 bg-red-500/10 p-3 text-xs text-red-100">
            {error}
          </div>
        )}
        {!loading && !error && filteredNotifications.length === 0 && <NotificationEmptyState />}
        <div className="space-y-2">
          {filteredNotifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onOpen={openNotification}
            />
          ))}
        </div>
      </div>
      <footer className="border-t border-white/10 p-3 text-[0.66rem] leading-5 text-slate-500">
        ARGUS puede combinar fuentes abiertas, reportes ciudadanos y estimaciones propias. Las alertas ARGUS no reemplazan instrucciones oficiales.
      </footer>
    </aside>
  );
}
