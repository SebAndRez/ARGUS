import type { VigiaReport } from "@/modules/vigia/types";
import VigiaReportCard from "@/modules/vigia/components/VigiaReportCard";

interface Props {
  reports: VigiaReport[];
  onSelect?: (report: VigiaReport) => void;
  showSensitiveDetails?: boolean;
}

export default function VigiaReportFeed({ reports, onSelect, showSensitiveDetails }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Feed de reportes
        </h2>
        <span className="text-[0.6rem] text-slate-500">{reports.length} reportes</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {reports.length === 0 && (
          <p className="text-xs text-slate-500">Sin reportes ciudadanos por el momento.</p>
        )}
        {reports.map((report) => (
          <VigiaReportCard
            key={report.id}
            report={report}
            onSelect={onSelect}
            showSensitiveDetails={showSensitiveDetails}
          />
        ))}
      </div>
    </section>
  );
}
