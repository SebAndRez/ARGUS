"use client";

import { useId, useState } from "react";

export interface VigiaEvidenceDraft {
  id: string;
  filename: string;
  type: "photo" | "video" | "audio";
}

interface Props {
  evidence: VigiaEvidenceDraft[];
  onChange: (evidence: VigiaEvidenceDraft[]) => void;
}

/**
 * Placeholder de evidencia. El proyecto todavía no tiene almacenamiento real
 * de archivos, así que esto solo registra metadata local (nombre de
 * archivo/tipo) para mostrar en el reporte — no sube nada a un servicio
 * externo.
 */
export default function VigiaEvidenceUploader({ evidence, onChange }: Props) {
  const inputId = useId();
  const [pendingName, setPendingName] = useState("");

  function addPlaceholder() {
    if (!pendingName.trim()) return;
    onChange([
      ...evidence,
      { id: `draft-${Date.now()}`, filename: pendingName.trim(), type: "photo" },
    ]);
    setPendingName("");
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs text-slate-300">
        Evidencia (opcional)
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={pendingName}
          onChange={(event) => setPendingName(event.target.value)}
          placeholder="Nombre de archivo (ej. foto1.jpg)"
          className="flex-1 border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-cyan-400/70"
        />
        <button
          type="button"
          onClick={addPlaceholder}
          className="border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase text-slate-300 hover:text-white"
        >
          Adjuntar
        </button>
      </div>
      <p className="text-[0.65rem] text-slate-500">
        La carga real de archivos aún no está disponible; esta versión solo registra la referencia.
      </p>
      {evidence.length > 0 && (
        <ul className="grid gap-1">
          {evidence.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-slate-300"
            >
              {item.filename}
              <button
                type="button"
                onClick={() => onChange(evidence.filter((e) => e.id !== item.id))}
                className="text-slate-500 hover:text-red-300"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
