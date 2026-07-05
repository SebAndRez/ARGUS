import type { SessionUser } from "@/types/crisis";
import type { VigiaReporterStanding, VigiaReputationSummary } from "@/modules/vigia/types";

/**
 * VIGÍA no reimplementa el motor de reputación: reutiliza los campos reales
 * de `SessionUser` (`trustScore`, `strikes`, `accountStatus`), que ya están
 * gobernados por `src/services/reputationService.ts` (server-side, Prisma).
 * Este archivo solo traduce esos valores al vocabulario de VIGÍA.
 *
 * Umbrales alineados con `reputationService.ts`:
 *   strikes >= 2 -> WATCHED   -> "observed"
 *   strikes >= 3 -> LIMITED   -> "limited"
 *   strikes >= 4 -> SUSPENDED -> "blocked"
 *   strikes >= 5 -> BANNED    -> "blocked"
 */
export function resolveVigiaStanding(user: SessionUser | null | undefined): VigiaReporterStanding {
  if (!user) return "normal";
  if (["SUSPENDED", "BANNED"].includes(user.accountStatus)) return "blocked";
  if (user.accountStatus === "LIMITED") return "limited";
  if (user.accountStatus === "WATCHED") return "observed";
  if (user.trustScore >= 70 && user.strikes === 0) return "trusted";
  return "normal";
}

/**
 * Regla crítica: SOS nunca se bloquea por reputación. Solo los reportes
 * normales (VIGÍA) pueden limitarse por abuso reiterado.
 */
export function canCreateNormalReport(user: SessionUser | null | undefined): boolean {
  const standing = resolveVigiaStanding(user);
  return standing !== "blocked";
}

export function canCreateSos(): true {
  return true;
}

export function buildVigiaReputationSummary(
  user: SessionUser | null | undefined,
  reportsSubmitted: number,
  reportsConfirmed: number
): VigiaReputationSummary {
  const standing = resolveVigiaStanding(user);
  return {
    standing,
    score: user?.trustScore ?? 0,
    reportsSubmitted,
    reportsConfirmed,
    warnings: user?.strikes ? Math.min(user.strikes, 2) : 0,
    strikes: user?.strikes ?? 0,
    canCreateNormalReports: canCreateNormalReport(user),
    canCreateSos: true,
  };
}
