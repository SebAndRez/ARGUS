import KnowledgeIntakePanel from "@/components/dashboard/KnowledgeIntakePanel";
import LegalNoticeBanner from "@/components/legal/LegalNoticeBanner";

export default function DashboardKnowledgeIntakePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white xl:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/dashboard" className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white">
            Volver a Command
          </a>
          <a href="/app" className="rounded border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20">
            Abrir mapa
          </a>
        </div>
        <LegalNoticeBanner />
        <KnowledgeIntakePanel />
      </div>
    </main>
  );
}
