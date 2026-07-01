import type { ReactNode } from "react";

interface GuideSectionProps {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}

export default function GuideSection({
  id,
  title,
  intro,
  children,
}: GuideSectionProps) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 py-8">
      <div className="mb-5">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-cyan-300/70">
          Guia ARGUS
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        {intro ? <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}
