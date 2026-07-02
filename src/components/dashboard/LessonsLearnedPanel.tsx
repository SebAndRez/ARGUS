import { demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";
import type { ArgusHazardDomain } from "@/types/knowledgeIntake";

export default function LessonsLearnedPanel({ domain }: { domain?: ArgusHazardDomain }) {
  const lessons = domain ? demoKnowledgeLessons.filter((lesson) => lesson.domain === domain) : demoKnowledgeLessons;
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/75 p-5">
      <p className="text-xs font-semibold uppercase text-cyan-200">Lessons Learned</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Lecciones reutilizables</h2>
      <div className="mt-4 grid gap-3">
        {lessons.slice(0, 6).map((lesson) => (
          <article key={lesson.id} className="rounded border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{lesson.title}</h3>
              <span className="rounded bg-amber-400/10 px-2 py-1 text-xs text-amber-100">{lesson.confidenceScore}%</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">{lesson.summary}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lesson.recommendedResponseActions.slice(0, 2).map((action) => (
                <span key={action} className="rounded border border-white/10 px-2 py-1 text-[0.7rem] text-slate-300">
                  {action}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
