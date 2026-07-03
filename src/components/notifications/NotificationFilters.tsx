"use client";

import type {
  ArgusNotificationSeverity,
  ArgusNotificationSourceType,
  ArgusNotificationType,
} from "@/types/notificationCenter";
import {
  notificationTypeLabels,
  severityLabels,
} from "@/lib/notifications/notificationVisuals";

export interface NotificationFilterState {
  severity: "ALL" | ArgusNotificationSeverity;
  type: "ALL" | ArgusNotificationType;
  sourceType: "ALL" | ArgusNotificationSourceType;
}

interface NotificationFiltersProps {
  value: NotificationFilterState;
  onChange: (value: NotificationFilterState) => void;
}

const sourceLabels: Record<ArgusNotificationSourceType, string> = {
  OFFICIAL: "Oficial",
  OPEN_DATA: "Open data",
  CITIZEN: "Ciudadana",
  ARGUS_ESTIMATE: "ARGUS",
  INSTITUTIONAL: "Institucional",
  SYSTEM: "Sistema",
};

export default function NotificationFilters({
  value,
  onChange,
}: NotificationFiltersProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-500">
        Severidad
        <select
          value={value.severity}
          onChange={(event) =>
            onChange({ ...value, severity: event.target.value as NotificationFilterState["severity"] })
          }
          className="mt-1 h-9 w-full border border-white/10 bg-slate-950 px-2 text-xs font-semibold normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-300/50"
        >
          <option value="ALL">Todas</option>
          {Object.entries(severityLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-500">
        Tipo
        <select
          value={value.type}
          onChange={(event) =>
            onChange({ ...value, type: event.target.value as NotificationFilterState["type"] })
          }
          className="mt-1 h-9 w-full border border-white/10 bg-slate-950 px-2 text-xs font-semibold normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-300/50"
        >
          <option value="ALL">Todos</option>
          {Object.entries(notificationTypeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-500">
        Fuente
        <select
          value={value.sourceType}
          onChange={(event) =>
            onChange({ ...value, sourceType: event.target.value as NotificationFilterState["sourceType"] })
          }
          className="mt-1 h-9 w-full border border-white/10 bg-slate-950 px-2 text-xs font-semibold normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-300/50"
        >
          <option value="ALL">Todas</option>
          {Object.entries(sourceLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
