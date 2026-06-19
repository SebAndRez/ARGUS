"use client";

import { useState } from "react";
import {
  canReactivateAlert,
  getLifecycleStatus,
} from "@/lib/alertLifecycle";
import type {
  AlertVerificationAction,
  CrisisEvent,
} from "@/types/crisis";

interface Props {
  event: CrisisEvent;
  onVerifyAction: (action: AlertVerificationAction) => void;
}

const feedbackLabels: Record<AlertVerificationAction, string> = {
  still_happening: "Registramos que sigues viendo esta situación.",
  not_happening: "Registramos que ya no observas esta situación.",
  cannot_verify: "Registramos que no pudiste verificarla.",
  false_report: "La señal quedó marcada para revisión.",
  reactivate: "La alerta volvió a verificación en modo demo.",
};

export default function AlertVerificationActions({ event, onVerifyAction }: Props) {
  const [feedback, setFeedback] = useState<{ eventId: string; message: string } | null>(null);
  const lifecycle = getLifecycleStatus(event);
  const canReactivate = canReactivateAlert(event);
  const isClosed = lifecycle === "resolved" || lifecycle === "dismissed";

  const submitAction = (action: AlertVerificationAction) => {
    onVerifyAction(action);
    setFeedback({ eventId: event.id, message: feedbackLabels[action] });
  };

  if (isClosed && !canReactivate) {
    return (
      <section className="rounded-lg border border-white/10 bg-slate-900/55 p-4">
        <p className="text-sm text-slate-300">
          Esta alerta no acepta verificaciones ciudadanas en su estado actual.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-300/20 bg-amber-400/6 p-4">
      <div>
        <p className="text-[0.65rem] font-semibold uppercase text-amber-200">
          ¿Qué observas ahora?
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Responde solo si puedes hacerlo sin acercarte al peligro.
        </p>
      </div>

      {canReactivate ? (
        <button
          type="button"
          onClick={() => submitAction("reactivate")}
          className="mt-4 min-h-12 w-full rounded-md border border-amber-200/40 bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-100"
        >
          Sigo viendo esto: reactivar alerta
        </button>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => submitAction("still_happening")}
            className="min-h-12 rounded-md border border-cyan-200/35 bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          >
            Sigo viendo esto
          </button>
          <button
            type="button"
            onClick={() => submitAction("not_happening")}
            className="min-h-12 rounded-md border border-emerald-200/25 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            Ya no ocurre
          </button>
          <button
            type="button"
            onClick={() => submitAction("cannot_verify")}
            className="min-h-11 rounded-md border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 sm:col-span-2"
          >
            No puedo verificar
          </button>
        </div>
      )}

      {feedback?.eventId === event.id && (
        <p className="mt-3 rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-300" role="status">
          {feedback.message}
        </p>
      )}
    </section>
  );
}
