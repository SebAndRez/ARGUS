"use client";

import { type FormEvent, useState } from "react";
import type { SessionUser } from "@/types/crisis";

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
  }) => Promise<void>;
  session: SessionUser | null;
  location: { latitude: number; longitude: number };
}

const categories = [
  "Incendio",
  "Accidente vehicular",
  "Emergencia médica",
  "Infraestructura",
  "Seguridad pública",
  "Servicios",
  "Otro",
];

export default function ReportModal({ open, onClose, onSubmit, session, location }: Props) {
  const [category, setCategory] = useState(categories[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        category,
        title,
        description,
        latitude: location.latitude,
        longitude: location.longitude,
        locationText: "Ubicación actual",
      });
      setTitle("");
      setDescription("");
      onClose();
    } catch (err) {
      setError("No se pudo crear el reporte. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl shadow-black/50">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">Reporte operativo</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Nuevo reporte</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-white">Cerrar</button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">Categoría</label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70">
              {categories.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">Título</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título breve" className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70" />
          </div>

          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">Descripción</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Describe el incidente con claridad" className="min-h-[120px] resize-none rounded-3xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70" />
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            <p>Ubicación usada: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
            <p>Usuario: {session?.publicAlias ?? "Invitado"}</p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Enviando…" : "Enviar reporte"}
          </button>
        </form>
      </div>
    </div>
  );
}
