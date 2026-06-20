import { getArgusSource } from "@/config/argusSourceRegistry";
import type {
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
  NasaFirmsCsvRow,
} from "@/types/ingestion";

const RECOMMENDED_ACTION =
  "Evite acercarse a la zona y revise información oficial si observa humo o fuego.";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

export function parseNasaFirmsCsv(csv: string): NasaFirmsCsvRow[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    ) as unknown as NasaFirmsCsvRow;
  });
}

function finiteNumber(value?: string) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseAcquisitionTime(dateValue: string, timeValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  const paddedTime = timeValue.trim().padStart(4, "0");
  if (!/^\d{4}$/.test(paddedTime)) return null;

  const date = new Date(
    `${dateValue}T${paddedTime.slice(0, 2)}:${paddedTime.slice(2)}:00Z`
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeConfidence(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 65;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  if (normalized === "h" || normalized === "high") return 90;
  if (normalized === "n" || normalized === "nominal") return 75;
  if (normalized === "l" || normalized === "low") return 55;
  return 65;
}

function getSeverity(
  confidence: number,
  frp: number | null
): ArgusIngestionSeverity {
  if (confidence >= 90 && typeof frp === "number" && frp >= 100) {
    return "critical";
  }
  if (confidence >= 80 || (typeof frp === "number" && frp >= 50)) {
    return "high";
  }
  if (confidence >= 60 || (typeof frp === "number" && frp >= 10)) {
    return "medium";
  }
  return "low";
}

export function normalizeNasaFirms(
  row: NasaFirmsCsvRow
): ArgusNormalizedEvent | null {
  const latitude = finiteNumber(row.latitude);
  const longitude = finiteNumber(row.longitude);
  const occurredAt = parseAcquisitionTime(row.acq_date, row.acq_time);
  if (latitude === null || longitude === null || !occurredAt) return null;

  const confidence = normalizeConfidence(row.confidence);
  const frp = finiteNumber(row.frp);
  const brightness =
    finiteNumber(row.bright_ti4) ?? finiteNumber(row.brightness);
  const satellite = row.satellite?.trim() || null;
  const instrument = row.instrument?.trim() || null;
  const source = getArgusSource("nasa_firms");
  const sensorLabel = [satellite, instrument].filter(Boolean).join(" / ");
  const confidenceLabel = row.confidence?.trim() || `${confidence}%`;
  const externalId = [
    satellite ?? "sat",
    instrument ?? "sensor",
    row.acq_date,
    row.acq_time.padStart(4, "0"),
    latitude.toFixed(4),
    longitude.toFixed(4),
  ].join(":");

  return {
    id: `nasa-firms-${externalId.replace(/[^a-z0-9.-]+/gi, "-")}`,
    sourceId: "nasa_firms",
    sourceName: source?.name ?? "NASA FIRMS",
    externalId,
    title: "Foco térmico detectado",
    description:
      "Anomalía térmica satelital publicada por NASA FIRMS. No equivale por sí sola a un incendio confirmado.",
    category: "thermal_anomaly",
    severity: getSeverity(confidence, frp),
    confidence,
    latitude,
    longitude,
    occurredAt,
    updatedAt: occurredAt,
    rawFrp: frp,
    rawBrightness: brightness,
    satellite,
    instrument,
    dayNight: row.daynight?.trim() || null,
    recommendedAction: RECOMMENDED_ACTION,
    whyItMatters: `${sensorLabel || "Sensor satelital"} detectó una anomalía térmica el ${row.acq_date} a las ${row.acq_time.padStart(4, "0")} UTC, con confianza ${confidenceLabel}${frp !== null ? ` y FRP ${frp} MW` : ""}.`,
    isExternal: true,
  };
}
