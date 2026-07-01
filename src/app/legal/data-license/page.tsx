import ArgusLegalFooter from "@/components/legal/ArgusLegalFooter";

export const metadata = { title: "Licencia de datos - ARGUS GRID" };

export default function DataLicensePage() {
  return (
    <>
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
        <section className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-slate-950/80 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            ARGUS Data License
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Licencia de datos</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Los datos ARGUS tienen uso limitado. No se permite reventa,
            extraccion, datasets derivados, entrenamiento de modelos,
            scraping o integracion institucional sin permiso formal.
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Las APIs requieren autorizacion, API key, rate limits, auditoria y
            contrato. Datos sensibles quedan excluidos del uso publico.
          </p>
        </section>
      </main>
      <ArgusLegalFooter />
    </>
  );
}
