import FenixTwinPanel from "@/components/fenix/FenixTwinPanel";
import LegalNoticeBanner from "@/components/legal/LegalNoticeBanner";

export default function DashboardFenixPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="p-4">
        <LegalNoticeBanner />
      </div>
      <FenixTwinPanel />
    </main>
  );
}
