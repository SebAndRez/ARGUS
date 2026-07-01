import type { ReactNode } from "react";

interface GuideCardProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}

export default function GuideCard({ title, eyebrow, children }: GuideCardProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/72 p-4 shadow-xl shadow-black/20">
      {eyebrow ? (
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300/75">
          {eyebrow}
        </p>
      ) : null}
      <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-slate-300">{children}</div>
    </article>
  );
}
