import { classifySeverityFromLevel } from "@/lib/weather/severeWeatherClassifier";
import { severityFromTipoAlerta } from "@/lib/adapters/senapred/senapredEventosAdapter";

/**
 * Covers ARGUS audit P0-4: `senapredEventosAdapter` (live map path,
 * `/api/argus/events`) and `alertPromotionEngine` (via
 * `classifySeverityFromLevel` directly) must never classify the same
 * SENAPRED `tipoAlerta.nombre` text with two different severities.
 *
 * Also covers the follow-up review: "Alerta Naranja" defaults to `high`
 * (same tier as "Alerta Amarilla"), NOT `critical` — there is no product
 * sign-off yet on which additional-context keywords (evacuación, personas
 * atrapadas, daño estructural, amenaza directa, instrucción oficial crítica)
 * would justify escalating a specific Naranja alert, and the classifier only
 * receives the short level label here, not the alert body, so it can't
 * check for them anyway.
 */
export function runSevereWeatherClassifierTest() {
  const roja = classifySeverityFromLevel("Alerta Roja");
  const naranja = classifySeverityFromLevel("Alerta Naranja");
  const amarilla = classifySeverityFromLevel("Alerta Amarilla");
  const tempranaPreventiva = classifySeverityFromLevel("Alerta Temprana Preventiva");
  const verde = classifySeverityFromLevel("Alerta Verde");

  // Same inputs through the adapter's wrapper — must agree with the
  // classifier above on every level, since the adapter now delegates to it.
  const adapterRoja = severityFromTipoAlerta("Alerta Roja");
  const adapterNaranja = severityFromTipoAlerta("Alerta Naranja");
  const adapterAmarilla = severityFromTipoAlerta("Alerta Amarilla");
  const adapterTempranaPreventiva = severityFromTipoAlerta("Alerta Temprana Preventiva");
  const adapterVerde = severityFromTipoAlerta("Alerta Verde");

  return {
    passed:
      roja === "critical" &&
      naranja === "high" &&
      naranja === amarilla &&
      amarilla === "high" &&
      tempranaPreventiva === "medium" &&
      verde === "low" &&
      // Parity: no divergence between the two pipelines for any level.
      adapterRoja === roja &&
      adapterNaranja === naranja &&
      adapterAmarilla === amarilla &&
      adapterTempranaPreventiva === tempranaPreventiva &&
      adapterVerde === verde,
    roja,
    naranja,
    amarilla,
    tempranaPreventiva,
    verde,
    adapterRoja,
    adapterNaranja,
    adapterAmarilla,
    adapterTempranaPreventiva,
    adapterVerde,
  };
}
