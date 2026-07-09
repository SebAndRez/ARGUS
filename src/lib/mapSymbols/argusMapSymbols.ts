export type ArgusMapEventKind =
  | "user"
  | "earthquake"
  | "tsunami"
  | "fire"
  | "weather"
  | "wind"
  | "smoke"
  | "citizen_report"
  | "force_report"
  | "official_source"
  | "live_camera"
  | "risk_assessment"
  /** Tornado / waterspout / severe straight-line wind — shares this one differentiated funnel-cloud marker rather than falling back to generic "risk_assessment". */
  | "tornado"
  /** Structural / roof / bridge collapse — shares this one differentiated marker rather than falling back to generic "risk_assessment". */
  | "structural_collapse"
  | "unknown";

export type ArgusMapSeverity =
  | "inactive"
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type ArgusMapConfidence =
  | "raw"
  | "reported"
  | "verified"
  | "multi_source"
  | "official"
  | "unknown";

export interface ArgusMapSymbolDefinition {
  kind: ArgusMapEventKind;
  severity: ArgusMapSeverity;
  confidence: ArgusMapConfidence;
  label?: string;
  title?: string;
  active?: boolean;
  selected?: boolean;
}

export interface ArgusDivIconDefinition {
  html: string;
  className: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}

const severityColor: Record<ArgusMapSeverity, string> = {
  inactive: "#64748b",
  info: "#38bdf8",
  low: "#34d399",
  medium: "#facc15",
  high: "#fb923c",
  critical: "#ef4444",
};

const severityGlow: Record<ArgusMapSeverity, string> = {
  inactive: "rgba(100,116,139,0.18)",
  info: "rgba(56,189,248,0.28)",
  low: "rgba(52,211,153,0.26)",
  medium: "rgba(250,204,21,0.3)",
  high: "rgba(251,146,60,0.34)",
  critical: "rgba(239,68,68,0.45)",
};

const sizeBySeverity: Record<ArgusMapSeverity, number> = {
  inactive: 30,
  info: 32,
  low: 34,
  medium: 38,
  high: 42,
  critical: 46,
};

const borderByConfidence: Record<ArgusMapConfidence, string> = {
  raw: "1px solid rgba(226,232,240,0.45)",
  reported: "2px dashed rgba(226,232,240,0.72)",
  verified: "2px solid rgba(226,232,240,0.78)",
  multi_source: "3px double rgba(255,255,255,0.9)",
  official: "2px solid rgba(255,255,255,0.95)",
  unknown: "1px solid rgba(148,163,184,0.38)",
};

const shapeClipPath: Partial<Record<ArgusMapEventKind, string>> = {
  earthquake: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)",
  tsunami: "polygon(50% 100%, 96% 12%, 4% 12%)",
  official_source: "inset(8% round 4px)",
  force_report: "polygon(50% 2%, 88% 18%, 82% 70%, 50% 98%, 18% 70%, 12% 18%)",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function getArgusMarkerColor(severity: ArgusMapSeverity) {
  return severityColor[severity] ?? severityColor.info;
}

export function getArgusMarkerSize(severity: ArgusMapSeverity) {
  return sizeBySeverity[severity] ?? sizeBySeverity.info;
}

export function getArgusMarkerBorder(confidence: ArgusMapConfidence) {
  return borderByConfidence[confidence] ?? borderByConfidence.unknown;
}

export function getArgusMarkerPulse(definition: ArgusMapSymbolDefinition) {
  return Boolean(
    definition.active ||
      definition.severity === "critical" ||
      definition.severity === "high"
  );
}

export function getArgusMarkerSymbol(kind: ArgusMapEventKind) {
  switch (kind) {
    case "user":
      return `<circle cx="18" cy="18" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="18" cy="18" r="3.8" fill="white"/>`;
    case "earthquake":
      return `<path d="M17 6 11 18h6l-4 12 12-16h-7l4-8z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`;
    case "tsunami":
      return `<path d="M8 22c4.5-8 10.7-8 16.4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11 25c3.8 3.2 9.5 3.2 14 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`;
    case "fire":
      return `<path d="M19 31c5.4-2.6 8-6.3 6.8-10.6-.7-2.7-2.7-4.4-5.2-7.5-.1 3.5-1.4 5.2-3.1 6.5.1-3.9-2.2-6.7-5.4-9.9.5 6-4.6 8.9-4.6 14.1 0 4.2 3.3 7.1 8.1 8.1-1.4-1.7-1.2-4.3.9-6.6.4 2.5 2.1 3.5 2.5 5.9z" fill="currentColor"/>`;
    case "wind":
      return `<path d="M6 13h18c3 0 4.5-3.5 2.3-5.5-1.4-1.2-3.9-1-4.9.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 20h23" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 27h13c3.2 0 4.4 3.5 2.1 5.3-1.4 1.1-3.6.8-4.6-.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    case "smoke":
    case "weather":
      return `<path d="M11 23h15a5 5 0 0 0 .7-9.9 8 8 0 0 0-15.2-2.8A6.4 6.4 0 0 0 11 23z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 29h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    case "citizen_report":
      return `<circle cx="18" cy="18" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M18 9v18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    case "force_report":
      return `<path d="M18 5 28 9v9c0 6.2-4.1 10.7-10 13-5.9-2.3-10-6.8-10-13V9z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`;
    case "official_source":
      return `<path d="M11 9h14M18 9v18M13 27h10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`;
    case "live_camera":
      return `<path d="M8 13h15v12H8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m23 17 6-3v10l-6-3z" fill="currentColor"/><circle cx="15.5" cy="19" r="2.6" fill="currentColor"/>`;
    case "risk_assessment":
      return `<path d="M18 5 31 29H5z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M18 14v7M18 25v.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`;
    case "tornado":
      return `<path d="M6 8h24l-3 5H10z" fill="currentColor"/><path d="M10 15h16l-2.6 5H13z" fill="currentColor"/><path d="M13.5 21h9l-2 5h-5z" fill="currentColor"/><path d="M16 27h4l-.9 4h-2.2z" fill="currentColor"/>`;
    case "structural_collapse":
      return `<path d="M9 31V12l7-3.5v6l4-2v18.5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 31h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M15 31l1.8-6.5 3 3.5 2-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    default:
      return `<circle cx="18" cy="18" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M18 13v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="18" cy="24" r="1.3" fill="currentColor"/>`;
  }
}

export function createArgusMarkerHtml(definition: ArgusMapSymbolDefinition) {
  const size = getArgusMarkerSize(definition.severity);
  const color = getArgusMarkerColor(definition.severity);
  const border = getArgusMarkerBorder(definition.confidence);
  const glow = severityGlow[definition.severity] ?? severityGlow.info;
  const pulse = getArgusMarkerPulse(definition);
  const clipPath = shapeClipPath[definition.kind];
  const label = definition.label?.trim().slice(0, 5);
  const title = escapeHtml(definition.title ?? definition.kind);
  const selected = definition.selected
    ? "box-shadow:0 0 0 2px rgba(255,255,255,0.92),0 0 0 5px rgba(8,47,73,0.85),0 0 26px rgba(34,211,238,0.5);"
    : "";
  const shapeStyle = [
    `width:${size}px`,
    `height:${size}px`,
    `color:${color}`,
    `background:linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.82))`,
    `border:${border}`,
    `box-shadow:0 0 ${Math.round(size * 0.55)}px ${glow}`,
    clipPath ? `clip-path:${clipPath}` : "border-radius:999px",
    selected,
  ]
    .filter(Boolean)
    .join(";");

  return `
    <div class="argus-symbol-marker ${pulse ? "argus-symbol-marker-pulse" : ""}" title="${title}" aria-label="${title}" role="img" style="width:${size + 12}px;height:${size + 12}px">
      ${pulse ? `<span class="argus-symbol-pulse" style="background:${color}"></span>` : ""}
      <span class="argus-symbol-core" style="${shapeStyle}">
        <svg viewBox="0 0 36 36" aria-hidden="true">${getArgusMarkerSymbol(definition.kind)}</svg>
        ${label ? `<span class="argus-symbol-label">${escapeHtml(label)}</span>` : ""}
      </span>
    </div>
  `;
}

export function createArgusDivIcon(
  definition: ArgusMapSymbolDefinition
): ArgusDivIconDefinition {
  const size = getArgusMarkerSize(definition.severity) + 12;

  return {
    html: createArgusMarkerHtml(definition),
    className: "argus-symbol-leaflet-icon leaflet-div-icon bg-transparent p-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}
