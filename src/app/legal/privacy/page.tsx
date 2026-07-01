import ArgusLegalFooter from "@/components/legal/ArgusLegalFooter";

export const metadata = { title: "Privacidad - ARGUS GRID" };

export default function PrivacyPage() {
  return (
    <>
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
        <section className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-slate-950/80 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            Borrador legal
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Politica de privacidad</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            ARGUS puede tratar datos de cuenta, ubicacion, reportes, SOS, Safety
            Check, sensores demo/experimentales y datos medicos opcionales cuando
            existan controles adecuados. El documento base esta en
            `docs/legal/PRIVACY_POLICY_DRAFT.md`.
          </p>
          <p className="mt-4 text-sm leading-6 text-amber-100">
            Exportacion, eliminacion de cuenta, RLS completo y consentimiento
            versionado deben implementarse antes de produccion publica con datos
            sensibles reales.
          </p>
        </section>
      </main>
      <ArgusLegalFooter />
    </>
  );
}
