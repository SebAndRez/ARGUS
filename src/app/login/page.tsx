"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      setError(data.error || "No se pudo iniciar sesión.");
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <h1 className="text-3xl font-semibold text-white">Iniciar sesión</h1>
        <p className="mt-3 text-sm text-slate-400">Usa cualquiera de las cuentas demo para entrar al sistema.</p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
              placeholder="ciudadano.activo@demo.cl"
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Iniciando…" : "Ingresar"}
          </button>

          <p className="text-xs text-slate-500">Cuenta demo disponible: ciudadano.activo@demo.cl, ciudadano.observado@demo.cl, ciudadano.limitado@demo.cl, ciudadano.suspendido@demo.cl, ciudadano.baneado@demo.cl, operador@demo.cl, admin@demo.cl</p>
        </form>
      </div>
    </main>
  );
}
