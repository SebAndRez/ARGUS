"use client";

import { useState } from "react";
import { VESTA_CATEGORY_LABELS, VESTA_CATEGORY_ORDER } from "@/modules/vesta/data";
import type { VestaChecklistCategory, VestaChecklistItem, VestaChecklistStatus } from "@/modules/vesta/types";

const STATUS_LABELS: Record<VestaChecklistStatus, string> = {
  pending: "Pendiente",
  ready: "Listo",
  expiresSoon: "Vence pronto",
  review: "Revisar",
  notApplicable: "No aplica",
};

const STATUS_TONE: Record<VestaChecklistStatus, string> = {
  pending: "text-slate-400 border-white/10",
  ready: "text-emerald-300 border-emerald-300/30",
  expiresSoon: "text-amber-300 border-amber-300/30",
  review: "text-cyan-300 border-cyan-300/30",
  notApplicable: "text-slate-600 border-white/5",
};

interface Props {
  items: VestaChecklistItem[];
  canEdit: boolean;
  onStatusChange: (id: string, status: VestaChecklistStatus) => void;
  onAddItem: (category: VestaChecklistCategory, label: string) => void;
  priorityOrder?: VestaChecklistCategory[];
}

export default function VestaChecklistPanel({ items, canEdit, onStatusChange, onAddItem, priorityOrder }: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<VestaChecklistCategory>("water_food");
  const categoryOrder = priorityOrder && priorityOrder.length ? priorityOrder : VESTA_CATEGORY_ORDER;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {categoryOrder.map((category) => {
          const categoryItems = items.filter((item) => item.category === category);
          if (categoryItems.length === 0) return null;
          return (
            <div key={category} className="border border-white/10 bg-white/[0.03] p-3">
              <h4 className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">
                {VESTA_CATEGORY_LABELS[category]}
              </h4>
              <ul className="mt-2 grid gap-1.5">
                {categoryItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-sm text-slate-200">
                    <span className={item.status === "notApplicable" ? "text-slate-600 line-through" : ""}>
                      {item.label}
                    </span>
                    <select
                      value={item.status}
                      disabled={!canEdit}
                      onChange={(event) => onStatusChange(item.id, event.target.value as VestaChecklistStatus)}
                      className={`h-7 border bg-slate-950 px-1.5 text-[0.65rem] font-bold uppercase disabled:opacity-50 ${STATUS_TONE[item.status]}`}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 border border-white/10 bg-white/[0.02] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newLabel.trim()) return;
            onAddItem(newCategory, newLabel.trim());
            setNewLabel("");
          }}
        >
          <label className="grid gap-1 text-[0.65rem] text-slate-400">
            Categoría
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as VestaChecklistCategory)}
              className="h-9 border border-white/10 bg-slate-950 px-2 text-xs text-white"
            >
              {VESTA_CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {VESTA_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid flex-1 gap-1 text-[0.65rem] text-slate-400">
            Nuevo ítem
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Ej: Botiquín veterinario"
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
