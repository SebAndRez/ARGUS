"use client";

import type { ArgusRiskEvidence } from "@/types/riskAssessment";

interface Props {
  evidence: ArgusRiskEvidence[];
}

export default function RiskEvidenceList({ evidence }: Props) {
  if (evidence.length === 0) {
    return (
      <p className="text-xs leading-5 text-slate-500">
        Sin evidencia suficiente para elevar una hipotesis.
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {evidence.slice(0, 4).map((item) => (
        <li
          key={item.id}
          className="border border-white/8 bg-slate-950/55 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.58rem] font-bold uppercase text-cyan-200">
              {item.sourceName ?? item.sourceId}
            </span>
            <span className="font-mono text-[0.58rem] text-slate-500">
              peso {item.weight}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-300">{item.finding}</p>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-[0.6rem] font-semibold uppercase text-cyan-300 hover:text-cyan-100"
            >
              Fuente
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
