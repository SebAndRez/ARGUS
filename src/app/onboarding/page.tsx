"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { countries } from "@/data/countries";
import { useI18n } from "@/hooks/useI18n";
import { useSession } from "@/hooks/useSession";
import {
  getDocumentHelpText,
  getDocumentLabel,
  getDocumentPlaceholder,
} from "@/lib/identity/countryDocumentRules";

function OnboardingPageContent() {
  const { t } = useI18n();
  const { user, loading } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/app";
  const [publicAlias, setPublicAlias] = useState(user?.publicAlias ?? "");
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? "CL");
  const [countryQuery, setCountryQuery] = useState("");
  const [city, setCity] = useState(user?.city ?? "");
  const [region, setRegion] = useState(user?.region ?? "");
  const [documentValue, setDocumentValue] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(Boolean(user?.termsAccepted));
  const [privacyAccepted, setPrivacyAccepted] = useState(Boolean(user?.privacyAccepted));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    return countries.filter((country) =>
      !query ||
      country.code.toLowerCase().includes(query) ||
      country.nameEs.toLowerCase().includes(query) ||
      country.nameEn.toLowerCase().includes(query)
    );
  }, [countryQuery]);

  async function completeProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicAlias,
          countryCode,
          city,
          region,
          document: documentValue,
          termsAccepted,
          privacyAccepted,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo completar el perfil.");
      router.push(next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!loading && user && !user.profileCompletionRequired) {
      router.replace(next);
    }
  }, [loading, next, router, user]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <form
        onSubmit={completeProfile}
        className="mx-auto max-w-3xl rounded-lg border border-cyan-300/20 bg-slate-950/88 p-6 shadow-2xl shadow-black/35"
      >
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
          <Field label={t("auth.email")}>
            <input value={user?.email ?? ""} readOnly className={inputClass()} />
            {!user?.emailVerified ? (
              <span className="text-xs text-amber-200">{t("profile.emailPending")}</span>
            ) : null}
          </Field>
          <Field label={t("profile.alias")}>
            <input
              value={publicAlias}
              onChange={(event) => setPublicAlias(event.target.value)}
              className={inputClass()}
              placeholder="vecino_norte"
            />
          </Field>
          <Field label="Buscar país">
            <input
              value={countryQuery}
              onChange={(event) => setCountryQuery(event.target.value)}
              className={inputClass()}
              placeholder="Chile, Argentina, United..."
            />
          </Field>
          <Field label={t("profile.country")}>
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className={inputClass()}>
              {filteredCountries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.nameEs} ({country.code})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={countryCode === "CL" ? "Ciudad o comuna" : "Ciudad / localidad"}>
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder={countryCode === "CL" ? "Ej. Valparaíso, Santiago, Concepción" : "Ciudad / localidad"}
                className={inputClass()}
              />
            </Field>
            <Field label="Región / estado">
              <input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="Opcional"
                className={inputClass()}
              />
            </Field>
          </div>
          <Field label={getDocumentLabel(countryCode)} hint={getDocumentHelpText(countryCode)}>
            <input
              value={documentValue}
              onChange={(event) => setDocumentValue(event.target.value)}
              placeholder={getDocumentPlaceholder(countryCode)}
              className={inputClass()}
            />
          </Field>
          <label className="flex gap-3 rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>Acepto términos de uso.</span>
          </label>
          <label className="flex gap-3 rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
            <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
            <span>Acepto política de privacidad.</span>
          </label>
        </div>

        {error ? (
          <div className="mt-5 rounded border border-red-300/20 bg-red-400/10 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving || !user}
            className="inline-flex min-h-11 items-center justify-center rounded border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Completar perfil y entrar"}
          </button>
        </div>
      </form>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

function inputClass() {
  return "rounded border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-cyan-300/60";
}
