import ArgusLegalFooter from "@/components/legal/ArgusLegalFooter";
import LegalNoticeBanner from "@/components/legal/LegalNoticeBanner";

export const metadata = { title: "Acceso institucional - ARGUS GRID" };

export default function InstitutionalAccessPage() {
  return (
    <>
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
        <section className="mx-auto grid max-w-5xl gap-5">
          <div className="rounded-lg border border-cyan-300/20 bg-slate-950/84 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              ARGUS Command
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Acceso institucional</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              ARGUS Core es la capa ciudadana. ARGUS Command, ARGUS API, AURA Pro,
              Fenix institucional y ARGUS Data requieren autorizacion expresa,
              convenio, auditoria y condiciones de uso estrictas.
            </p>
          </div>
          <LegalNoticeBanner />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Convenio", "Ninguna entidad puede explotar o integrar ARGUS sin permiso formal."],
              ["API", "El acceso API requiere key, rate limits, trazabilidad y auditoria."],
              ["Datos", "Reportes ciudadanos y datos sensibles no son datasets abiertos."],
            ].map(([title, body]) => (
              <article key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <h2 className="font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <ArgusLegalFooter />
    </>
  );
}
