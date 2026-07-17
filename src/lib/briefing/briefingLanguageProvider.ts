import type {
  BriefingLanguageProvider,
  DeterministicBriefing,
  GeneratedBriefingResult,
  SerializedBriefingContext,
} from "@/types/operationalBriefing";

/**
 * ARGUS — punto de extensión del proveedor generativo opcional (Prompt 8
 * §31-§38). Ninguna llamada externa ocurre en este módulo, en este pase, en
 * ninguna condición.
 *
 * El mandato exige que la capa generativa SOLO pueda implementarse si el
 * repositorio ya contiene, simultáneamente: proveedor aprobado, credenciales
 * configuradas, dependencia instalada, política documentada, feature flag y
 * decisión explícita de producto. Verificado antes de escribir este módulo
 * (`docs/architecture/ARGUS_OPERATIONAL_BRIEFING_IMPLEMENTATION.md` §6):
 * `package.json` no declara ninguna dependencia de OpenAI/Anthropic/Google
 * Generative AI/ai-sdk, no existe ninguna variable de entorno de API key de
 * LLM en el repo, y no existe ningún documento de política/aprobación para
 * un proveedor generativo. Ninguna de las condiciones se cumple — por lo
 * tanto, siguiendo la regla explícita del mandato ("si falta cualquiera de
 * estas condiciones: NO IMPLEMENTAR LLAMADA EXTERNA"), este módulo expone
 * únicamente la interfaz y un feature flag permanentemente apagado.
 */

const GENERATIVE_BRIEFING_ENV_FLAG = "ARGUS_GENERATIVE_BRIEFING_ENABLED";

/**
 * Ningún proveedor real está registrado en este pase (ver
 * `nullBriefingLanguageProvider` abajo) — esta constante existe para que esa
 * ausencia sea la razón explícita por la que `isGenerativeBriefingEnabled()`
 * nunca puede devolver `true` todavía, en vez de un literal `&& false` sin
 * contexto. Una futura sesión con un proveedor real aprobado cambia esto a
 * `true` en el mismo lugar donde registra ese proveedor.
 */
const GENERATIVE_BRIEFING_PROVIDER_APPROVED: boolean = false;

/**
 * La bandera se lee de `process.env` (mismo patrón sin módulo central de
 * flags que el resto del repo, ver
 * `ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` §4) para que una futura
 * sesión con aprobación explícita solo necesite activar la variable de
 * entorno — pero permanece `false` hasta que
 * `GENERATIVE_BRIEFING_PROVIDER_APPROVED` también sea `true`, nunca antes.
 */
export function isGenerativeBriefingEnabled(): boolean {
  return GENERATIVE_BRIEFING_PROVIDER_APPROVED && process.env[GENERATIVE_BRIEFING_ENV_FLAG] === "true";
}

/**
 * Proveedor nulo — el único registrado en este pase. Nunca se invoca en la
 * práctica porque `isGenerativeBriefingEnabled()` siempre es `false`, pero
 * existe para que el punto de extensión (`rewrite`) tenga una implementación
 * de referencia con la forma correcta del contrato.
 */
export const nullBriefingLanguageProvider: BriefingLanguageProvider = {
  providerId: "none",
  async rewrite(
    _serialized: SerializedBriefingContext,
    deterministicBriefing: DeterministicBriefing
  ): Promise<GeneratedBriefingResult> {
    return {
      executiveSummary: deterministicBriefing.executiveSummary,
      situation: [deterministicBriefing.status.territoryLabel],
      changes: deterministicBriefing.recentChanges,
      impacts: [deterministicBriefing.impact.infrastructureSummary],
      risks: deterministicBriefing.compositeRisks.map((risk) => risk.rule),
      actions: deterministicBriefing.actions.map((action) => action.action),
      gaps: deterministicBriefing.gaps.map((gap) => gap.description),
      limitations: deterministicBriefing.limitations,
      citedEvidenceIds: deterministicBriefing.evidence.citedIds,
    };
  },
};
