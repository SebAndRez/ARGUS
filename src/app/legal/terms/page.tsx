import ArgusLegalFooter from "@/components/legal/ArgusLegalFooter";

export const metadata = { title: "Terminos de uso - ARGUS GRID" };

export default function TermsPage() {
  return (
    <>
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
        <section className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-slate-950/80 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            Borrador legal
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Terminos de uso</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            ARGUS es una plataforma civil de apoyo a crisis. El uso ciudadano
            permite reportar, pedir ayuda, ver alertas y consultar fuentes. Esta
            pagina es un resumen no definitivo; el documento base esta en
            `docs/legal/TERMS_OF_USE_DRAFT.md`.
          </p>
          <div className="mt-6 grid gap-4 text-sm leading-6 text-slate-300">
            <p>No se permite scraping, extraccion masiva, reventa de datos,
            ingenieria inversa de APIs, vigilancia ilegal, persecucion politica,
            targeting ofensivo ni uso institucional/gubernamental sin convenio.</p>
            <p>ARGUS no reemplaza autoridades ni servicios de emergencia. En una
            emergencia real, contacte tambien canales oficiales si tiene senal.</p>
          </div>
        </section>
      </main>
      <ArgusLegalFooter />
    </>
  );
}
