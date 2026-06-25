"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (!google) return;

    const messages: Record<string, string> = {
      missing_config: "Google login aun no esta configurado en este entorno.",
      invalid_state: "La sesion Google expiro. Intenta nuevamente.",
      token_error: "Google no pudo entregar una sesion valida.",
      profile_error: "No fue posible leer la identidad basica de Google.",
      callback_error: "No fue posible completar el inicio con Google.",
    };
    setGoogleMessage(messages[google] ?? "No fue posible iniciar con Google.");
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "No se pudo iniciar sesion.");
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-lg border border-cyan-300/15 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-cyan-300/80">
          ARGUS GRID
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Acceso operacional</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Ingresa con una cuenta demo o usa Google solo como identidad. ARGUS no solicita permisos de Gmail ni lee correos.
        </p>

        <a
          href="/api/auth/google/start"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
        >
          Continuar con Google
        </a>

        {googleMessage && (
          <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {googleMessage}
          </p>
        )}

        <div className="mt-6 flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          Login local
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
              placeholder="ciudadano.activo@demo.cl"
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Iniciando..." : "Ingresar"}
          </button>

          <p className="text-xs leading-5 text-slate-500">
            Demo: ciudadano.activo@demo.cl, ciudadano.observado@demo.cl,
            ciudadano.limitado@demo.cl, ciudadano.suspendido@demo.cl,
            ciudadano.baneado@demo.cl, operador@demo.cl, admin@demo.cl
          </p>
        </form>

        <div className="mt-6 rounded-md border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">No tienes cuenta?</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Crea una cuenta con documento/RUT unico. El documento se guarda como hash.
          </p>
          <Link
            href="/register"
            className="mt-3 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-100"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}
