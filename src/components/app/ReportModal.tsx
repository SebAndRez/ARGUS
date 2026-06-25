"use client";

import { type FormEvent, useState } from "react";
import type { SessionUser } from "@/types/crisis";

interface MissingPersonPayload {
  displayName?: string;
  ageApprox?: string;
  lastSeenText?: string;
  lastSeenAt?: string;
  status?: string;
  relatedEventType?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    category: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    locationText?: string;
    missingPerson?: MissingPersonPayload;
  }) => Promise<void>;
  session: SessionUser | null;
  location: { latitude: number; longitude: number };
}

const categories = [
  { value: "Incendio", label: "Incendio" },
  { value: "Accidente vehicular", label: "Accidente vehicular" },
  { value: "Emergencia medica", label: "Emergencia medica" },
  { value: "Infraestructura", label: "Infraestructura" },
  { value: "Seguridad publica", label: "Seguridad publica" },
  { value: "Servicios", label: "Servicios" },
  { value: "missing_person", label: "Persona desaparecida" },
  { value: "Otro", label: "Otro" },
];

export default function ReportModal({
  open,
  onClose,
  onSubmit,
  session,
  location,
}: Props) {
  const [category, setCategory] = useState(categories[0].value);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [missingName, setMissingName] = useState("");
  const [missingAge, setMissingAge] = useState("");
  const [lastSeenText, setLastSeenText] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState("");
  const [relatedEventType, setRelatedEventType] = useState("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const isMissingPerson = category === "missing_person";
    const missingSummary = isMissingPerson
      ? [
          missingName ? `Nombre/alias: ${missingName}` : null,
          missingAge ? `Edad aprox.: ${missingAge}` : null,
          lastSeenText ? `Ultima ubicacion conocida: ${lastSeenText}` : null,
          lastSeenAt ? `Hora aprox.: ${lastSeenAt}` : null,
          "Estado: needs_verification",
          `Evento relacionado: ${relatedEventType}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    try {
      await onSubmit({
        category,
        title: isMissingPerson
          ? title || `Persona desaparecida${missingName ? `: ${missingName}` : ""}`
          : title,
        description: isMissingPerson
          ? `${description}\n\n${missingSummary}`.trim()
          : description,
        latitude: location.latitude,
        longitude: location.longitude,
        locationText: isMissingPerson
          ? lastSeenText || "Ultima ubicacion reportada"
          : "Ubicacion actual",
        missingPerson: isMissingPerson
          ? {
              displayName: missingName,
              ageApprox: missingAge,
              lastSeenText,
              lastSeenAt,
              status: "needs_verification",
              relatedEventType,
            }
          : undefined,
      });
      setTitle("");
      setDescription("");
      setMissingName("");
      setMissingAge("");
      setLastSeenText("");
      setLastSeenAt("");
      setRelatedEventType("unknown");
      onClose();
    } catch {
      setError("No se pudo crear el reporte. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="argus-mobile-modal fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl shadow-black/50 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">
              Reporte operativo
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Nuevo reporte</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 transition hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Categoria
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {category === "missing_person" && (
            <section className="grid gap-3 rounded-3xl border border-amber-300/15 bg-amber-400/8 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                Busqueda y rescate
              </p>
              <p className="text-xs leading-5 text-slate-400">
                Se mostraran solo datos minimos utiles. No publiques telefono,
                email ni datos sensibles en la descripcion.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={missingName}
                  onChange={(event) => setMissingName(event.target.value)}
                  placeholder="Nombre o alias si existe"
                  className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                />
                <input
                  value={missingAge}
                  onChange={(event) => setMissingAge(event.target.value)}
                  placeholder="Edad aproximada"
                  className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                />
                <input
                  value={lastSeenText}
                  onChange={(event) => setLastSeenText(event.target.value)}
                  placeholder="Ultima zona vista"
                  className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                />
                <input
                  value={lastSeenAt}
                  onChange={(event) => setLastSeenAt(event.target.value)}
                  placeholder="Hora aproximada"
                  className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                />
              </div>
              <select
                value={relatedEventType}
                onChange={(event) => setRelatedEventType(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
              >
                <option value="unknown">Evento relacionado desconocido</option>
                <option value="earthquake">Terremoto</option>
                <option value="fire">Incendio</option>
                <option value="flood">Inundacion</option>
                <option value="disturbance">Disturbio</option>
                <option value="accident">Accidente</option>
              </select>
            </section>
          )}

          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Titulo
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Titulo breve"
              className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Descripcion
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Describe el incidente con claridad"
              className="min-h-[120px] resize-none rounded-3xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
            />
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            <p>
              Ubicacion usada: {location.latitude.toFixed(4)},{" "}
              {location.longitude.toFixed(4)}
            </p>
            <p>Usuario: {session?.publicAlias ?? "Invitado"}</p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Enviar reporte"}
          </button>
        </form>
      </div>
    </div>
  );
}
