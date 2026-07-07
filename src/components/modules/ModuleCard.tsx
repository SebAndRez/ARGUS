import Link from "next/link";
import type { ArgusModuleDefinition, ModuleAccessResult } from "@/types/argusModule";
import ModuleBadge from "@/components/modules/ModuleBadge";
import ModuleIcon from "@/components/modules/ModuleIcon";

const colorAccent: Record<string, string> = {
  rose: "text-rose-300",
  amber: "text-amber-300",
  cyan: "text-cyan-300",
  red: "text-red-300",
  teal: "text-teal-300",
  emerald: "text-emerald-300",
  orange: "text-orange-300",
  violet: "text-violet-300",
  sky: "text-sky-300",
  fuchsia: "text-fuchsia-300",
  green: "text-green-300",
};

interface Props {
  module: ArgusModuleDefinition;
  access: ModuleAccessResult;
}

export default function ModuleCard({ module, access }: Props) {
  const accent = colorAccent[module.color] ?? "text-cyan-300";

  return (
    <article className="argus-tactical-panel flex flex-col gap-3 border border-white/10 bg-slate-950/85 p-4 shadow-xl shadow-black/30 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`${accent}`}>
            <ModuleIcon icon={module.icon} />
          </span>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-white">
              {module.name}
            </h3>
            <p className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
              {module.category}
            </p>
          </div>
        </div>
        <ModuleBadge label={module.badgeLabel} variant={module.badgeVariant} />
      </header>

      <p className="text-xs leading-5 text-slate-300">{module.description}</p>

      <div className="mt-auto flex flex-col gap-2">
        {access.canEnter ? (
          <Link
            href={module.route}
            className="inline-flex min-h-9 items-center justify-center border border-cyan-300/30 bg-cyan-400/12 px-3 text-xs font-bold uppercase tracking-[0.1em] text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Entrar
          </Link>
        ) : (
          <>
            <button
              type="button"
              disabled
              className="inline-flex min-h-9 cursor-not-allowed items-center justify-center border border-white/10 bg-white/[0.02] px-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500"
            >
              {module.isRestricted ? "Acceso restringido" : "Requiere plan institucional"}
            </button>
            {access.reason && (
              <p className="text-[0.65rem] leading-4 text-slate-500">{access.reason}</p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
