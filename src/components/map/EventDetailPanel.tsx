"use client";

import {
  ALERT_SEVERITY_PRESENTATION,
  CONFIDENCE_PRESENTATION,
  getDefaultConfidenceLevel,
  getDefaultSourceSummary,
  type InterfaceVariant,
} from "@/config/argusDesignSystem";
import {
  deriveConfidenceFromSignals,
  derivePriorityScore,
  deriveRecommendedAction,
  deriveWhyItMatters,
  getLifecycleStatus,
} from "@/lib/alertLifecycle";
import AlertLifecycleBadge from "@/components/ui/AlertLifecycleBadge";
import AlertVerificationActions from "@/components/ui/AlertVerificationActions";
import ConfidenceBlock from "@/components/ui/ConfidenceBlock";
import RecommendedActionBlock from "@/components/ui/RecommendedActionBlock";
import SourceTypeBadge from "@/components/ui/SourceTypeBadge";
import type {
  AlertVerificationAction,
  CrisisEvent,
} from "@/types/crisis";

interface Props {
  event: CrisisEvent | null;
  onCenter?: (event: CrisisEvent) => void;
  onClose?: () => void;
  onVerifyAction?: (eventId: string, action: AlertVerificationAction) => void;
  variant?: InterfaceVariant;
}

const priorityLabels: Record<string, string> = {
  LOW: "Prioridad baja",
  MEDIUM: "Prioridad media",
  HIGH: "Prioridad alta",
  CRITICAL: "Prioridad crítica",
};

const statusLabels: Record<string, string> = {
  NEW: "Abierto",
  RECEIVED: "Recibido",
  UNDER_REVIEW: "En revisión",
  VALIDATED: "Validado",
  ASSIGNED: "En atención",
  ESCALATED: "Escalado",
  RESOLVED: "Resuelto",
  DISCARDED: "Descartado",
  CANCELLED: "Cancelado",
};

function typeBadge(type: CrisisEvent["type"]) {
  if (type === "SOS") {
    return {
      label: "Solicitud SOS",
      className: "border-red-300/35 bg-red-500/15 text-red-100",
    };
  }

  if (type === "ALERT") {
    return {
      label: "Alerta operativa",
      className: "border-amber-300/30 bg-amber-400/10 text-amber-100",
    };
  }

  return {
    label: "Reporte ciudadano",
    className: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  };
}

function statusBadge(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase() || "UNKNOWN";
  const label = statusLabels[normalized] ?? normalized.replaceAll("_", " ");

  if (["RESOLVED", "VALIDATED"].includes(normalized)) {
    return {
      label,
      className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
    };
  }

  if (["ESCALATED", "CANCELLED", "DISCARDED"].includes(normalized)) {
    return {
      label,
      className: "border-red-300/30 bg-red-500/10 text-red-200",
    };
  }

  if (["UNDER_REVIEW", "ASSIGNED"].includes(normalized)) {
    return {
      label,
      className: "border-amber-300/25 bg-amber-400/10 text-amber-200",
    };
  }

  return {
    label,
    className: "border-sky-300/25 bg-sky-400/10 text-sky-200",
  };
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function EventDetailPanel({
  event,
  onCenter,
  onClose,
  onVerifyAction,
  variant = "operator",
}: Props) {
  if (!event) {
    return (
      <section className="relative min-w-0 overflow-hidden rounded-lg border border-cyan-400/15 bg-slate-950/90 shadow-2xl shadow-black/30 backdrop-blur-xl">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-slate-900/90 text-lg text-slate-400 transition hover:border-cyan-300/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            aria-label="Cerrar detalle"
            title="Cerrar detalle"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        )}
        <div className="border-l-4 border-cyan-400/70 px-5 py-6 pr-14">
          <p className="text-[0.65rem] font-semibold uppercase text-cyan-300/75">Detalle de incidente</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Sin evento seleccionado</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Selecciona un incidente en el mapa o en el panel táctico para abrir su ficha operacional.
          </p>
        </div>
      </section>
    );
  }

  const severity = ALERT_SEVERITY_PRESENTATION[event.severity];
  const type = typeBadge(event.type);
  const status = statusBadge(event.status);
  const lifecycleStatus = getLifecycleStatus(event);
  const priorityValue = event.priority?.toUpperCase() ?? null;
  const priorityLabel = priorityValue ? priorityLabels[priorityValue] ?? `Prioridad ${priorityValue}` : null;
  const priorityScore = event.priorityScore ?? derivePriorityScore(event);
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  const coordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : null;
  const timestamp = formatTimestamp(event.createdAt);
  const confidence = deriveConfidenceFromSignals(event);
  const confidenceLabel =
    event.confidenceLabel ??
    CONFIDENCE_PRESENTATION[getDefaultConfidenceLevel({ type: event.type, status: event.status })].label;
  const sourceCategory =
    event.sourceCategory ?? (event.type === "REPORT" || event.type === "SOS" ? "citizen_stream" : "unverified");
  const sourceBadgeLabel = event.sourceCategory
    ? undefined
    : event.type === "REPORT"
      ? "Reporte ciudadano"
      : event.type === "SOS"
        ? "Solicitud ciudadana"
        : "Fuente pendiente";
  const sourceSummary = event.sourceSummary?.trim() || getDefaultSourceSummary(event.type);
  const whyItMatters = deriveWhyItMatters(event);
  const recommendedAction =
    deriveRecommendedAction(event, variant) || event.aiRecommendation?.trim();
  const lastVerifiedAt = formatTimestamp(event.lastVerifiedAt);
  const verificationCount = event.verificationCount ?? 0;
  const stillHappeningCount = event.stillHappeningCount ?? 0;
  const notHappeningCount = event.notHappeningCount ?? 0;
  const hasDescription = Boolean(event.description?.trim());
  const hasAiAnalysis = Boolean(event.aiSummary?.trim());
  const hasOperationalData = Boolean(event.locationText?.trim() || coordinates || timestamp);

  return (
    <section className="relative max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-cyan-400/20 bg-slate-950/95 shadow-2xl shadow-black/35 backdrop-blur-xl xl:max-h-[calc(100dvh-220px)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${severity.accentClassName}`} />

      <header className="border-b border-white/10 px-5 pb-5 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.65rem] font-semibold uppercase text-cyan-300/75">Detalle de incidente</p>
          <div className="flex items-center gap-2">
            <span className={`rounded-md border px-2.5 py-1 text-[0.62rem] font-bold uppercase ${type.className}`}>
              {type.label}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900/80 text-lg text-slate-400 transition hover:border-cyan-300/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                aria-label="Cerrar detalle"
                title="Cerrar detalle"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            )}
          </div>
        </div>

        <h2 className="mt-3 break-words text-xl font-semibold leading-tight text-white sm:text-2xl">{event.title}</h2>
        {event.category?.trim() && <p className="mt-2 break-words text-sm text-slate-400">{event.category}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`rounded-md border px-2.5 py-1 text-[0.65rem] font-semibold uppercase ${severity.className}`}>
            {variant === "citizen" ? severity.citizenLabel : severity.operatorLabel}
          </span>
          {priorityLabel && (
            <span className={`rounded-md border px-2.5 py-1 text-[0.65rem] font-semibold uppercase ${severity.className}`}>
              {priorityLabel}
            </span>
          )}
          <span className={`rounded-md border px-2.5 py-1 text-[0.65rem] font-semibold uppercase ${status.className}`}>
            {status.label}
          </span>
          <AlertLifecycleBadge status={lifecycleStatus} />
          <SourceTypeBadge category={sourceCategory} label={sourceBadgeLabel} variant={variant} />
        </div>
      </header>

      <div className="divide-y divide-white/10">
        {hasDescription && (
          <section className="px-5 py-5 sm:px-6">
            <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Descripción</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{event.description}</p>
          </section>
        )}

        {hasOperationalData && (
          <section className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
            {event.locationText?.trim() && (
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Ubicación reportada</p>
                <p className="mt-1.5 break-words text-sm text-slate-200">{event.locationText}</p>
              </div>
            )}
            {coordinates && (
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Coordenadas</p>
                <p className="mt-1.5 break-all font-mono text-xs text-cyan-200">{coordinates}</p>
              </div>
            )}
            {timestamp && (
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Registrado</p>
                <p className="mt-1.5 text-sm text-slate-200">{timestamp}</p>
              </div>
            )}
          </section>
        )}

        {hasAiAnalysis && (
          <section className="bg-slate-900/45 px-5 py-5 sm:px-6">
            <p className="text-[0.65rem] font-semibold uppercase text-cyan-300/80">Contexto asistido</p>
            {event.aiSummary?.trim() && (
              <div className="mt-3">
                <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Síntesis IA</p>
                <p className="mt-2 break-words text-sm leading-6 text-slate-300">{event.aiSummary}</p>
              </div>
            )}
          </section>
        )}

        <section className="grid gap-3 px-5 py-5 sm:px-6">
          <section className="argus-calm-panel rounded-lg border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">Señales ciudadanas</p>
              <span className="rounded-md border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-[0.65rem] text-slate-300">
                Prioridad {priorityScore}/100
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-cyan-300/15 bg-cyan-400/5 px-2 py-2">
                <p className="font-mono text-sm font-bold text-cyan-200">{stillHappeningCount}</p>
                <p className="mt-1 text-[0.6rem] text-slate-400">Sigue activa</p>
              </div>
              <div className="rounded-md border border-emerald-300/15 bg-emerald-400/5 px-2 py-2">
                <p className="font-mono text-sm font-bold text-emerald-200">{notHappeningCount}</p>
                <p className="mt-1 text-[0.6rem] text-slate-400">Ya no ocurre</p>
              </div>
              <div className="rounded-md border border-white/10 bg-slate-900/60 px-2 py-2">
                <p className="font-mono text-sm font-bold text-white">{verificationCount}</p>
                <p className="mt-1 text-[0.6rem] text-slate-400">Verificaciones</p>
              </div>
            </div>
            {lastVerifiedAt && (
              <p className="mt-3 text-xs text-slate-500">Última señal: {lastVerifiedAt}</p>
            )}
          </section>
          <ConfidenceBlock
            score={confidence}
            label={confidenceLabel}
            sourceSummary={sourceSummary}
            lastUpdatedLabel={event.lastUpdatedLabel ?? lastVerifiedAt}
            whyItMatters={whyItMatters}
            variant={variant}
          />
          <RecommendedActionBlock
            action={recommendedAction}
            severity={event.severity}
            type={event.type}
            status={event.status}
            variant={variant}
          />
          {onVerifyAction && (
            <AlertVerificationActions
              event={event}
              onVerifyAction={(action) => onVerifyAction(event.id, action)}
            />
          )}
        </section>
      </div>

      {onCenter && (
        <footer className="border-t border-white/10 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => onCenter(event)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200/80 focus:ring-offset-2 focus:ring-offset-slate-950 sm:w-auto"
          >
            Centrar en mapa
          </button>
        </footer>
      )}
    </section>
  );
}
