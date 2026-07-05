import Link from "next/link";
import publicChangelog from "@/data/publicChangelog.json";

type PublicChangelogEntry = {
  changeId?: string;
  date: string;
  commit: string;
  title: string;
  fileCount?: number;
  summary: string;
  changes?: string[];
  affectedModules: string[];
  simpleExplanation: string;
};

const entries = publicChangelog as PublicChangelogEntry[];

export const metadata = {
  title: "Actualizaciones de ARGUS",
  description: "Cambios recientes de ARGUS explicados en simple.",
};

export default function UpdatesPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_34%),#020617] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="border-b border-white/10 pb-6">
          <Link
            href="/"
            className="text-xs font-semibold uppercase text-cyan-200 transition hover:text-white"
          >
            ARGUS GRID
          </Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-5xl">
                Actualizaciones de ARGUS
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Cambios recientes explicados en simple
              </p>
            </div>
            <Link
              href="/app"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/20"
            >
              Abrir mapa
            </Link>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
            Aun no hay actualizaciones publicas registradas.
          </div>
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => (
              <article
                key={entry.changeId ?? `${entry.date}-${entry.commit}-${entry.title}`}
                className="rounded-lg border border-white/10 bg-slate-950/82 p-5 shadow-xl shadow-black/25"
              >
                <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-cyan-200">
                      {entry.date} - {entry.commit}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{entry.title}</h2>
                  </div>
                  {typeof entry.fileCount === "number" ? (
                    <span className="w-fit rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-300">
                      {entry.fileCount} archivos
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Resumen</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{entry.summary}</p>
                    </div>

                    {entry.changes && entry.changes.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">Cambios principales</h3>
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
                          {entry.changes.map((change) => (
                            <li key={change}>- {change}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-cyan-300/15 bg-cyan-400/10 p-4">
                      <h3 className="text-sm font-semibold text-cyan-100">En simple</h3>
                      <p className="mt-2 text-sm leading-6 text-cyan-50/90">
                        {entry.simpleExplanation}
                      </p>
                    </div>
                  </div>

                  <aside>
                    <h3 className="text-sm font-semibold text-slate-100">Modulos afectados</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.affectedModules.map((module) => (
                        <span
                          key={module}
                          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-300"
                        >
                          {module}
                        </span>
                      ))}
                    </div>
                  </aside>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
