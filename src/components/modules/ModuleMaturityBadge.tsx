import type { ModuleMaturity } from "@/types/argusModule";
import ModuleBadge from "@/components/modules/ModuleBadge";

/**
 * Canonical capability-truth vocabulary (ARGUS Prompt 18, §26). Every
 * module that declares a `maturity` must render through this map instead of
 * a component-local label, so the five stabilized modules (and any future
 * one) speak the same language.
 */
export const moduleMaturityLabel: Record<ModuleMaturity, string> = {
  operational: "OPERATIVO",
  partially_operational: "PARCIAL",
  restricted: "RESTRINGIDO",
  preview: "VISTA PREVIA",
  planned: "PLANIFICADO",
  disabled: "NO DISPONIBLE",
};

const moduleMaturityVariant: Record<ModuleMaturity, "success" | "info" | "warning" | "danger" | "neutral"> = {
  operational: "success",
  partially_operational: "info",
  restricted: "danger",
  preview: "warning",
  planned: "neutral",
  disabled: "danger",
};

interface Props {
  maturity: ModuleMaturity;
  className?: string;
}

export default function ModuleMaturityBadge({ maturity, className = "" }: Props) {
  return (
    <ModuleBadge
      label={moduleMaturityLabel[maturity]}
      variant={moduleMaturityVariant[maturity]}
      className={className}
    />
  );
}
