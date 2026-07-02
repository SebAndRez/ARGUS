import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_35%),#020617] px-4 py-10 text-white">
      <section className="w-full max-w-3xl rounded-lg border border-cyan-300/20 bg-slate-950/88 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-cyan-300">
          ARGUS GRID
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Inicia sesión para entrar al mapa operativo.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
          ARGUS usa tu perfil para asociar reportes, SOS y preferencias de idioma/unidades.
          Una identidad real corresponde a una cuenta principal.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href="/api/auth/google/start?next=/app"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
          >
            Continuar con Google
          </a>
          <Link
            href="/login?next=/app"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-400/10 px-5 text-sm font-bold text-cyan-50 transition hover:bg-cyan-400/20"
          >
            Login local
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]"
          >
            Crear cuenta
          </Link>
        </div>
        <div className="mt-6 rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
          <p className="font-semibold">Alpha Preview / uso controlado</p>
          <p className="mt-1">
            Para SOS completo debes iniciar sesión. En una emergencia real, contacta
            también los números oficiales si tienes señal.
          </p>
        </div>
        <footer className="mt-6 flex flex-wrap gap-4 text-xs text-slate-400">
          <Link href="/legal/terms" className="hover:text-cyan-100">Términos</Link>
          <Link href="/legal/privacy" className="hover:text-cyan-100">Privacidad</Link>
          <Link href="/app/como-usar" className="hover:text-cyan-100">Cómo usar ARGUS</Link>
        </footer>
      </section>
    </main>
  );
}
