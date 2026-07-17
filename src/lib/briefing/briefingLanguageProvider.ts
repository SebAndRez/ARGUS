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
 * Siempre `false` en este pase — no existe ningún proveedor aprobado que
 * pueda activarse detrás de esta bandera todavía. La bandera se lee de
 * `process.env` (mismo patrón sin módulo central de flags que el resto del
 * repo, ver `ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` §4) para que una
 * futura sesión con aprobación explícita solo necesite activar la variable
 * de entorno y registrar un `BriefingLanguageProvider` real — nunca cambiar
 * la forma del contrato.
 */
export function isGenerativeBriefingEnabled(): boolean {
  return process.env[GENERATIVE_BRIEFING_ENV_FLAG] === "true" && false; // eslint-disable-line no-constant-condition -- intencional: ver docstring del módulo, nunca se activa sin una implementación de proveedor real aprobada.
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
