import type { ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

export type FirmsFetchParams = {
  bbox?: string;
  days?: number;
  source?: string;
};

export type FirmsCsvRecord = Record<string, string | undefined>;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseFirmsCsv(csv: string): FirmsCsvRecord[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function severityFromFirms(record: FirmsCsvRecord): ArgusIncidentSeverity {
  const frp = Number(record.frp ?? "0");
  const confidence = record.confidence ?? "";
  if (frp >= 100 || /high|h/i.test(confidence)) return "high";
  if (frp >= 30 || /nominal|n|medium/i.test(confidence)) return "medium";
  return "low";
}

export function normalizeFirmsFireRecord(record: FirmsCsvRecord): ArgusIncidentKnowledge | null {
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const date = record.acq_date && record.acq_time ? `${record.acq_date}T${record.acq_time.padStart(4, "0").slice(0, 2)}:${record.acq_time.padStart(4, "0").slice(2)}:00.000Z` : undefined;
  const confidenceRaw = record.confidence;
  const frp = Number(record.frp);
  const brightness = Number(record.bright_ti4 ?? record.brightness);
  const severity = severityFromFirms(record);
  const id = `firms-${record.latitude}-${record.longitude}-${record.acq_date ?? "date"}-${record.acq_time ?? "time"}`;

  return {
    id,
    title: "Foco termico detectado por NASA FIRMS",
    summary: "NASA FIRMS reported a thermal anomaly. A thermal focus is not automatically a confirmed wildfire.",
    domain: "wildfire",
    subtype: "active_fire_detection",
    severity,
    confidenceScore: /high|h/i.test(confidenceRaw ?? "") ? 82 : /low|l/i.test(confidenceRaw ?? "") ? 55 : 68,
    actionabilityScore: 48,
    sourceReliabilityScore: 90,
    evidenceCount: 1,
    sourceIds: ["nasa_firms"],
    sourceNames: ["NASA FIRMS"],
    occurredAt: date,
    detectedAt: date,
    latitude,
    longitude,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    technicalFactors: {
      brightness: Number.isFinite(brightness) ? brightness : undefined,
      firmsConfidence: confidenceRaw,
      frp: Number.isFinite(frp) ? frp : undefined,
      satellite: record.satellite,
      instrument: record.instrument,
    },
    causes: [],
    contributingFactors: ["Satellite thermal anomaly"],
    responseActions: ["Review official fire authority and local reports before confirming wildfire"],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: severity === "high" ? "high" : "medium",
        text: "Check smoke, wind, nearby communities and official fire reports before escalation.",
        rationale: "FIRMS provides thermal detection, not confirmed fire perimeter or response command.",
        confidenceScore: 68,
        safetyLimit: "Thermal focus is not always confirmed wildfire.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["nasa-firms", "thermal-anomaly", "wildfire"],
    language: "en",
    rawEvidenceRefs: [id],
    createdAt: date ?? new Date().toISOString(),
    updatedAt: date ?? new Date().toISOString(),
  };
}

export async function fetchFirmsActiveFires(params: FirmsFetchParams = {}) {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  if (!mapKey) {
    return {
      adapterId: "firmsAdapter",
      sourceId: "nasa_firms",
      sourceName: "NASA FIRMS",
      status: "requiresApiKey" as const,
      disabled: true,
      message: "NASA_FIRMS_MAP_KEY missing. Configure a valid MAP_KEY to enable FIRMS ingestion.",
      count: 0,
      incidents: [],
    };
  }

  const bbox = params.bbox ?? "-76,-56,-66,-17";
  const days = Math.min(Math.max(params.days ?? 1, 1), 10);
  const source = params.source ?? "VIIRS_SNPP_NRT";
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${bbox}/${days}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`NASA FIRMS responded ${response.status}`);
    const csv = await response.text();
    const incidents = parseFirmsCsv(csv)
      .map(normalizeFirmsFireRecord)
      .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident));
    return {
      adapterId: "firmsAdapter",
      sourceId: "nasa_firms",
      sourceName: "NASA FIRMS",
      status: "ready" as const,
      fetchedAt: new Date().toISOString(),
      count: incidents.length,
      incidents,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function firmsAdapter() {
  const configured = Boolean(process.env.NASA_FIRMS_MAP_KEY);
  return {
    adapterId: "firmsAdapter",
    sourceId: "nasa_firms",
    status: configured ? ("ready" as const) : ("requiresApiKey" as const),
    message: configured
      ? "NASA FIRMS MAP_KEY is configured; controlled ingestion can run on demand."
      : "NASA_FIRMS_MAP_KEY missing. FIRMS ingestion remains disabled.",
    envelopes: [],
  };
}
