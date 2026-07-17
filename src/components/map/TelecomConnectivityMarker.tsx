import type { CriticalPoiDivIconDefinition } from "@/components/map/CriticalPoiMarker";

/**
 * Insignia de estado regional/comunal de conectividad de emergencia
 * (centroide, no poligono — ver plan §7: una forma precisa implicaria una
 * confianza de ubicacion que el dato de origen, un comunicado que solo
 * nombra una region/comuna, no tiene). Convencion propia de
 * `CriticalPoiMarker.tsx` (forma+color+borde+etiqueta, nunca solo color),
 * deliberadamente distinta de `argusMapSymbols.ts` (eventos/incidentes):
 * esto es estado persistente, no un evento puntual.
 */

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const NETWORK_COLOR: Record<string, string> = {
  normal: "#16a34a",
  degraded: "#f59e0b",
  outage: "#dc2626",
  restored: "#0ea5e9",
  unknown: "#6b7280",
};

const NETWORK_LABEL: Record<string, string> = {
  normal: "red normal",
  degraded: "red degradada",
  outage: "red interrumpida",
  restored: "red restablecida",
  unknown: "red sin confirmar",
};

const ROAMING_LABEL: Record<string, string> = {
  none: "",
  roaming_automatico_nacional: "roaming automático nacional",
  roaming_emergencia: "roaming de emergencia",
};

/** Mismo criterio de borde por confianza que `verificationBorder` en `CriticalPoiMarker.tsx`. */
const VERIFICATION_BORDER: Record<string, { style: "solid" | "dashed"; width: number }> = {
  official: { style: "solid", width: 3 },
  corroborated: { style: "solid", width: 2.5 },
  candidate: { style: "solid", width: 1.5 },
  unverified: { style: "dashed", width: 1.5 },
  rejected: { style: "dashed", width: 1.5 },
};

export interface TelecomConnectivityBadgeInput {
  id: string;
  adminLevel1: string;
  adminLevel2?: string | null;
  roamingType: string;
  networkState: string;
  verificationStatus: string;
  isStale: boolean;
  centroidLatitude: number | null;
  centroidLongitude: number | null;
}

export function createConnectivityBadgeDivIcon(status: TelecomConnectivityBadgeInput): CriticalPoiDivIconDefinition {
  const size = 30;
  const color = NETWORK_COLOR[status.networkState] ?? NETWORK_COLOR.unknown;
  const border = VERIFICATION_BORDER[status.verificationStatus] ?? VERIFICATION_BORDER.unverified;
  const roamingLabel = ROAMING_LABEL[status.roamingType] ?? "";
  const locationLabel = status.adminLevel2 ? `${status.adminLevel2}, ${status.adminLevel1}` : status.adminLevel1;
  const staleLabel = status.isStale ? " · dato desactualizado" : "";
  const title = escapeHtml(`${locationLabel} · ${NETWORK_LABEL[status.networkState] ?? status.networkState}${roamingLabel ? ` · ${roamingLabel}` : ""}${staleLabel}`);
  const staleBadge = status.isStale
    ? `<span aria-hidden="true" style="position:absolute;top:-4px;right:-4px;width:${Math.round(size * 0.4)}px;height:${Math.round(size * 0.4)}px;background:#b45309;border-radius:999px;border:1px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.28)}px;line-height:1;">⏱</span>`
    : "";

  const html = `
    <div class="argus-connectivity-badge-marker" title="${title}" aria-label="${title}" role="img" style="position:relative;width:${size}px;height:${size}px;background:${color};clip-path:polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);border:${border.width}px ${border.style} rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.5)}px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,0.55);">
      📶${staleBadge}
    </div>
  `;

  return {
    html,
    className: "argus-connectivity-badge-leaflet-icon leaflet-div-icon bg-transparent p-0 border-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}
