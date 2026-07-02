"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [governmentId, setGovernmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, governmentId }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "No se pudo crear la cuenta.");
      return;
    }

    router.push("/onboarding?next=/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-cyan-300/80">
          ARGUS GRID
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Crear cuenta</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Registro preview con documento único. ARGUS guarda sólo hash del documento,
          no el RUT/ID en texto plano.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>Nombre</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
              placeholder="Nombre completo"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Correo electrónico</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
              placeholder="usuario@demo.cl"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>RUT / documento nacional</span>
            <input
              value={governmentId}
              onChange={(event) => setGovernmentId(event.target.value)}
              className="rounded-md border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
              placeholder="11111111-1"
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Registrando..." : "Crear cuenta"}
          </button>
        </form>
      </div>
    </main>
  );
}
