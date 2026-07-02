"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/hooks/useI18n";

function LoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();
  const next = useMemo(() => {
    const requested = params.get("next") ?? "/app";
    return requested.startsWith("/") ? requested : "/app";
  }, [params]);

  useEffect(() => {
    const google = params.get("google");
    if (!google) return;

    const messages: Record<string, string> = {
      missing_config: "Google OAuth no está configurado en este entorno.",
      redirect_mismatch: "Redirect URI no autorizado. Revisa Google Cloud Console.",
      google_error: "Google rechazó el inicio de sesión. Intenta nuevamente.",
      invalid_state: "La sesión Google expiró. Intenta nuevamente.",
      token_error: "Google no pudo entregar una sesión válida.",
      profile_error: "No fue posible leer la identidad básica de Google.",
      callback_error: "No se pudo completar login con Google.",
      success: "Login con Google completado.",
    };
    setGoogleMessage(messages[google] ?? "No fue posible iniciar con Google.");
  }, [params]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, next }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "No se pudo iniciar sesión.");
      return;
    }

    router.push(typeof data.next === "string" ? data.next : next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_420px]">
        <section className="rounded-lg border border-cyan-300/15 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-cyan-300/80">
            ARGUS GRID
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">{t("auth.landingTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {t("auth.landingBody")}
          </p>
          <p className="mt-3 rounded border border-cyan-300/15 bg-cyan-400/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100">
            {t("common.preview")}
          </p>

          <a
            href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md border border-white/10 bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
          >
            {t("auth.continueGoogle")}
          </a>

          {googleMessage && (
            <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              {googleMessage}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            {t("auth.localLogin")}
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>{t("auth.email")}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                placeholder="ciudadano.activo@demo.cl"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                placeholder="Mínimo 8 caracteres"
              />
            </label>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t("auth.signingIn") : "Iniciar sesión"}
            </button>
            <button
              type="button"
              className="text-left text-xs font-semibold text-slate-500 hover:text-cyan-200"
              title="Recuperación real pendiente de proveedor email."
            >
              Olvidé mi contraseña
            </button>
          </form>
        </section>

        <aside className="grid content-start gap-4">
          <section className="rounded-lg border border-red-300/25 bg-red-500/10 p-5 text-sm leading-6 text-red-50">
            <h2 className="text-lg font-semibold text-white">{t("auth.emergencySos")}</h2>
            <p className="mt-2 text-red-100/90">{t("auth.emergencyHelp")}</p>
          </section>
          <section className="rounded-lg border border-white/10 bg-slate-900/80 p-5 text-sm text-slate-300">
            <p className="font-semibold text-white">Cuenta e identidad</p>
            <p className="mt-2 leading-6">
              Un RUT/documento corresponde a una cuenta ARGUS principal. Google es
              autenticador; el documento es la identidad de cuenta y se guarda como hash.
            </p>
            <Link href="/register" className="mt-4 inline-flex font-semibold text-cyan-300 hover:text-cyan-100">
              {t("auth.createAccount")}
            </Link>
          </section>
          <footer className="flex flex-wrap gap-4 text-xs text-slate-500">
            <Link href="/legal/terms" className="hover:text-cyan-100">{t("auth.terms")}</Link>
            <Link href="/legal/privacy" className="hover:text-cyan-100">{t("auth.privacy")}</Link>
          </footer>
        </aside>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
          <div className="rounded-lg border border-cyan-300/20 bg-slate-900/90 p-6 text-sm text-cyan-100">
            Cargando acceso ARGUS...
          </div>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
