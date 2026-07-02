"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/hooks/useI18n";
import { useSession } from "@/hooks/useSession";

function OnboardingPageContent() {
  const { t } = useI18n();
  const { user, loading } = useSession();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/app";
  const [accepted, setAccepted] = useState(false);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto max-w-3xl rounded-lg border border-cyan-300/20 bg-slate-950/88 p-6 shadow-2xl shadow-black/35">
        <p className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-cyan-300">
          ARGUS onboarding
        </p>
        <h1 className="mt-3 text-3xl font-semibold">{t("profile.onboardingTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{t("profile.onboardingBody")}</p>

        {!loading && !user ? (
          <div className="mt-5 rounded border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            Debes iniciar sesión antes de completar identidad.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>{t("auth.email")}</span>
            <input
              value={user?.email ?? ""}
              readOnly
              className="rounded border border-white/10 bg-slate-900/80 px-3 py-3 text-white"
            />
            <span className="text-xs text-amber-200">{t("profile.emailPending")}</span>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>{t("profile.document")}</span>
            <input
              disabled
              placeholder="Pendiente: captura segura + hash server-side"
              className="rounded border border-white/10 bg-slate-900/50 px-3 py-3 text-slate-500"
            />
            <span className="text-xs text-slate-500">{t("profile.documentPrivacy")}</span>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>{t("profile.country")}</span>
            <select className="rounded border border-white/10 bg-slate-900/80 px-3 py-3 text-white" defaultValue="CL">
              <option value="CL">Chile</option>
              <option value="US">United States</option>
              <option value="PT">Portugal</option>
              <option value="BR">Brasil</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>{t("profile.alias")}</span>
            <input
              value={user?.publicAlias ?? ""}
              readOnly
              className="rounded border border-white/10 bg-slate-900/80 px-3 py-3 text-white"
            />
          </label>
          <label className="flex gap-3 rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>{t("profile.termsAccept")}</span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/perfil"
            className="inline-flex min-h-11 items-center justify-center rounded border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-50"
          >
            Completar en perfil
          </Link>
          <Link
            href={next}
            className={`inline-flex min-h-11 items-center justify-center rounded px-4 text-sm font-bold ${
              accepted
                ? "border border-white/10 bg-white text-slate-950"
                : "pointer-events-none border border-white/5 bg-white/[0.03] text-slate-600"
            }`}
          >
            Continuar en preview
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
          <div className="rounded-lg border border-cyan-300/20 bg-slate-900/90 p-6 text-sm text-cyan-100">
            Cargando onboarding ARGUS...
          </div>
        </main>
      }
    >
      <OnboardingPageContent />
    </Suspense>
  );
}
