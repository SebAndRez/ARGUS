"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countries } from "@/data/countries";
import {
  getDocumentHelpText,
  getDocumentLabel,
  getDocumentPlaceholder,
} from "@/lib/identity/countryDocumentRules";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [publicAlias, setPublicAlias] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [countryCode, setCountryCode] = useState("CL");
  const [countryQuery, setCountryQuery] = useState("");
  const [governmentId, setGovernmentId] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    return countries.filter((country) =>
      !query ||
      country.code.toLowerCase().includes(query) ||
      country.nameEs.toLowerCase().includes(query) ||
      country.nameEn.toLowerCase().includes(query)
    );
  }, [countryQuery]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        publicAlias,
        email,
        password,
        confirmPassword,
        countryCode,
        governmentId,
        termsAccepted,
        privacyAccepted,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "No se pudo crear la cuenta.");
      return;
    }

    router.push(data.next || "/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-cyan-300/80">
          ARGUS GRID
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Crear cuenta</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Una identidad nacional equivale a una cuenta ARGUS. El documento se
          normaliza y se guarda sólo como hash.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre">
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass()} />
            </Field>
            <Field label="Alias público">
              <input value={publicAlias} onChange={(event) => setPublicAlias(event.target.value)} className={inputClass()} placeholder="vecino_norte" />
            </Field>
            <Field label="Correo electrónico">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass()} />
            </Field>
            <Field label="Contraseña">
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass()} placeholder="Mínimo 8 caracteres" />
            </Field>
            <Field label="Confirmar contraseña">
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass()} />
            </Field>
            <Field label="Buscar país">
              <input value={countryQuery} onChange={(event) => setCountryQuery(event.target.value)} className={inputClass()} placeholder="Chile, Argentina, United..." />
            </Field>
          </div>

          <Field label="País">
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className={inputClass()}>
              {filteredCountries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.nameEs} ({country.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label={getDocumentLabel(countryCode)} hint={getDocumentHelpText(countryCode)}>
            <input
              value={governmentId}
              onChange={(event) => setGovernmentId(event.target.value)}
              className={inputClass()}
              placeholder={getDocumentPlaceholder(countryCode)}
            />
          </Field>

          <label className="flex gap-3 text-sm text-slate-300">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            Acepto términos de uso.
          </label>
          <label className="flex gap-3 text-sm text-slate-300">
            <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
            Acepto política de privacidad.
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      </div>
    </main>
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
  return "rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70";
}
