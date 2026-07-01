const baseUrl = process.env.ARGUS_AUDIT_BASE_URL ?? "http://127.0.0.1:3100";

type SmokeResult = {
  method: string;
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
};

const checks: Array<{
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}> = [
  { method: "GET", path: "/api/events" },
  { method: "GET", path: "/api/ingest/status" },
  { method: "GET", path: "/api/command/overview" },
  { method: "GET", path: "/api/incidents?limit=5" },
  { method: "GET", path: "/api/quakesense/clusters" },
  { method: "GET", path: "/api/mobile-safety/settings" },
  { method: "GET", path: "/api/mobile-safety/check-in" },
  {
    method: "POST",
    path: "/api/quakesense/signals",
    body: {
      id: "audit-quakesense-signal",
      sessionIdHash: "audit-session-hash",
      detectedAt: new Date().toISOString(),
      latRounded: -33.45,
      lngRounded: -70.67,
      accuracyBand: "district",
      peakAcceleration: 12.4,
      confidence: 64,
      userConsent: true,
      source: "citizen_sensor",
      isDemo: true,
    },
  },
  {
    method: "POST",
    path: "/api/mobile-safety/quake-event",
    body: {
      latitude: -33.45,
      longitude: -70.67,
      confidence: 68,
      peakAcceleration: 13.2,
      accuracyBand: "district",
    },
  },
];

async function runCheck(check: (typeof checks)[number]): Promise<SmokeResult> {
  const url = new URL(check.path, baseUrl);
  try {
    const response = await fetch(url, {
      method: check.method,
      headers:
        check.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: check.body === undefined ? undefined : JSON.stringify(check.body),
    });
    return {
      method: check.method,
      path: check.path,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      method: check.method,
      path: check.path,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results = await Promise.all(checks.map(runCheck));
  console.log(JSON.stringify({ baseUrl, results }, null, 2));

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main();
