"use client";

import { useState } from "react";
import type { VestaReminder } from "@/modules/vesta/types";

function formatDueLabel(dueAt: string, now: number) {
  const due = new Date(dueAt);
  const diffDays = Math.round((due.getTime() - now) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return `Vencido hace ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return "Vence hoy";
  return `Vence en ${diffDays}d`;
}

interface Props {
  reminders: VestaReminder[];
  canEdit: boolean;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onAdd: (title: string, frequencyDays: number | null) => void;
}

export default function VestaRemindersPanel({ reminders, canEdit, onComplete, onSkip, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [now] = useState(() => Date.now());
  const sorted = [...reminders].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {sorted.map((reminder) => {
          const overdue = new Date(reminder.dueAt).getTime() < now;
          return (
            <div
              key={reminder.id}
              className={`flex items-center justify-between gap-2 border p-2.5 text-sm ${
                overdue ? "border-amber-300/30 bg-amber-400/8" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div>
                <p className="text-slate-100">{reminder.title}</p>
                <p className={`text-[0.65rem] ${overdue ? "text-amber-300" : "text-slate-500"}`}>
                  {formatDueLabel(reminder.dueAt, now)}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onComplete(reminder.id)}
                    className="h-8 border border-emerald-300/30 bg-emerald-500/15 px-2 text-[0.65rem] font-bold uppercase text-emerald-100"
                  >
                    Hecho
                  </button>
                  <button
                    type="button"
                    onClick={() => onSkip(reminder.id)}
                    className="h-8 border border-white/10 bg-white/[0.03] px-2 text-[0.65rem] font-bold uppercase text-slate-400"
                  >
                    Posponer
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-slate-500">Sin recordatorios pendientes.</p>}
      </div>

      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 border border-white/10 bg-white/[0.02] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            onAdd(title.trim(), 90);
            setTitle("");
          }}
        >
          <label className="grid flex-1 gap-1 text-[0.65rem] text-slate-400">
            Nuevo recordatorio
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej: Renovar botiquín veterinario"
              className="h-9 min-w-[10rem] border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-600"
            />
          </label>
          <button
            type="submit"
            className="h-9 border border-emerald-300/30 bg-emerald-500/15 px-3 text-xs font-bold uppercase text-emerald-100"
          >
            Agregar
          </button>
        </form>
      )}
    </div>
  );
}
