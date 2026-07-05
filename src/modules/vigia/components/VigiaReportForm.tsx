"use client";

import { type FormEvent, useState } from "react";
import type { UserLocationStatus } from "@/types/crisis";
import type { VigiaReportType, VigiaSeverity } from "@/modules/vigia/types";
import VigiaReportTypeSelector from "@/modules/vigia/components/VigiaReportTypeSelector";
import VigiaEvidenceUploader, { type VigiaEvidenceDraft } from "@/modules/vigia/components/VigiaEvidenceUploader";
import VigiaLocationPanel from "@/modules/vigia/components/VigiaLocationPanel";

export interface VigiaReportFormSubmitPayload {
  type: VigiaReportType;
  title: string;
  description: string;
  severity: VigiaSeverity;
  location: { lat: number; lng: number; isApproximate: boolean };
  evidenceDrafts: VigiaEvidenceDraft[];
  tags?: string[];
}

interface Props {
  location: { latitude: number; longitude: number };
  locationStatus: UserLocationStatus;
  onRefreshLocation: () => void;
  onSubmit: (payload: VigiaReportFormSubmitPayload) => Promise<void>;
  canSubmit: boolean;
  disabledReason?: string;
  onClose?: () => void;
}

const severityOptions: { value: VigiaSeverity; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

/**
 * Formulario nativo de VIGÍA. Más simple para el usuario común (tipo,
 * descripción breve, severidad percibida, ubicación) y comparte el mismo
 * backend (`/api/reports`) que el `ReportModal` histórico del mapa, para no
 * duplicar la lógica de creación de reportes.
 */
export default function VigiaReportForm({
  location,
  locationStatus,
  onRefreshLocation,
  onSubmit,
  canSubmit,
  disabledReason,
  onClose,
}: Props) {
  const [type, setType] = useState<VigiaReportType>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<VigiaSeverity>("medium");
  const [manualLocation, setManualLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isApproximate, setIsApproximate] = useState(false);
  const [evidence, setEvidence] = useState<VigiaEvidenceDraft[]>([]);
  const [truthConfirmed, setTruthConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveLocation = manualLocation ?? { lat: location.latitude, lng: location.longitude };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    if (!Number.isFinite(effectiveLocation.lat) || !Number.isFinite(effectiveLocation.lng)) {
      setError("Se requiere una ubicación válida.");
      return;
    }
    if (!truthConfirmed) {
      setError("Debes confirmar que el reporte es verdadero según tu conocimiento.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        description: description.trim(),
        severity,
        location: { ...effectiveLocation, isApproximate },
        evidenceDrafts: evidence,
      });
      setTitle("");
      setDescription("");
      setEvidence([]);
      setTruthConfirmed(false);
      onClose?.();
    } catch (submitError) {
      setError((submitError as Error).message || "No se pudo enviar el reporte.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canSubmit) {
    return (
      <div className="border border-amber-300/25 bg-amber-400/8 p-4 text-sm text-amber-100">
        {disabledReason ?? "No puedes crear reportes normales en este momento."}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <VigiaReportTypeSelector value={type} onChange={setType} />

      <label className="grid gap-1.5 text-xs text-slate-300">
        Título (opcional)
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Resumen breve"
          className="border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-cyan-400/70"
        />
      </label>

      <label className="grid gap-1.5 text-xs text-slate-300">
        Descripción
        <textarea
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Describe qué está pasando y dónde"
          className="border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-cyan-400/70"
        />
      </label>

      <label className="grid gap-1.5 text-xs text-slate-300">
        Severidad percibida
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value as VigiaSeverity)}
          className="border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/70"
        >
          {severityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <VigiaLocationPanel
        latitude={effectiveLocation.lat}
        longitude={effectiveLocation.lng}
        status={locationStatus}
        onRefresh={onRefreshLocation}
        onManualLocation={(lat, lng) => setManualLocation({ lat, lng })}
        isApproximate={isApproximate}
        onToggleApproximate={setIsApproximate}
      />

      <VigiaEvidenceUploader evidence={evidence} onChange={setEvidence} />

      <label className="flex items-start gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={truthConfirmed}
          onChange={(event) => setTruthConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        Declaro que este reporte es verdadero según mi conocimiento.
      </label>
      <p className="text-[0.65rem] text-slate-500">
        Reportes falsos pueden afectar la reputación de la cuenta.
      </p>

      {error && <p className="border border-red-400/25 bg-red-500/8 px-3 py-2 text-xs text-red-200">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 border border-cyan-300/30 bg-cyan-400/12 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Enviando..." : "Enviar reporte"}
      </button>
    </form>
  );
}
