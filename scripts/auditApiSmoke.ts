const baseUrl = process.env.ARGUS_AUDIT_BASE_URL ?? "http://127.0.0.1:3100";

type SmokeResult = {
  method: string;
  path: string;
  ok: boolean;
  status?: number;
  jsonValid?: boolean;
  authRequired?: boolean;
  methodAllowed?: boolean;
  demo?: boolean;
  broken?: boolean;
  error?: string;
};

const checks: Array<{
  method: "GET";
  path: string;
  authRequired?: boolean;
  demo?: boolean;
}> = [
  { method: "GET", path: "/api/auth/me" },
  { method: "GET", path: "/api/session" },
  { method: "GET", path: "/api/reports", authRequired: true },
  { method: "GET", path: "/api/help-requests", authRequired: true },
  { method: "GET", path: "/api/missing-persons" },
  { method: "GET", path: "/api/external-events" },
  { method: "GET", path: "/api/events" },
  { method: "GET", path: "/api/ingest/status" },
  { method: "GET", path: "/api/conflict-zones", demo: true },
  { method: "GET", path: "/api/conflict-events", demo: true },
  { method: "GET", path: "/api/news-evidence", demo: true },
  { method: "GET", path: "/api/risk-assessments?limit=3" },
  { method: "GET", path: "/api/knowledge/facts?hazardType=tsunami&country=Chile" },
  { method: "GET", path: "/api/knowledge/documents?hazardType=tsunami&country=Chile" },
  { method: "GET", path: "/api/command/overview" },
  { method: "GET", path: "/api/command/sources" },
  { method: "GET", path: "/api/incidents" },
  { method: "GET", path: "/api/incidents?limit=5" },
  { method: "GET", path: "/api/fenix/scenarios", demo: true },
  { method: "GET", path: "/api/fenix/simulation", demo: true },
  { method: "GET", path: "/api/fenix/shelters", demo: true },
  { method: "GET", path: "/api/fenix/action-plan", demo: true },
  { method: "GET", path: "/api/routing-intelligence/routes", demo: true },
  { method: "GET", path: "/api/medical-points", demo: true },
  { method: "GET", path: "/api/medical-aid", demo: true },
  { method: "GET", path: "/api/quakesense/clusters" },
  { method: "GET", path: "/api/mobile-safety/settings" },
  { method: "GET", path: "/api/sensor-safety/settings", demo: true },
  { method: "GET", path: "/api/trust/profile", demo: true },
];

async function runCheck(check: (typeof checks)[number]): Promise<SmokeResult> {
  const url = new URL(check.path, baseUrl);
  try {
    const response = await fetch(url, {
      method: check.method,
      headers: { Accept: "application/json" },
    });
    let jsonValid = false;
    try {
      await response.clone().json();
      jsonValid = true;
    } catch {
      jsonValid = false;
    }
    return {
      method: check.method,
      path: check.path,
      ok:
        response.ok ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 405,
      status: response.status,
      jsonValid,
      authRequired: check.authRequired ?? [401, 403].includes(response.status),
      methodAllowed: response.status !== 405,
      demo: Boolean(check.demo),
      broken: response.status >= 500 || (!jsonValid && response.status !== 405),
    };
  } catch (error) {
    return {
      method: check.method,
      path: check.path,
      ok: false,
      jsonValid: false,
      authRequired: check.authRequired,
      methodAllowed: false,
      demo: Boolean(check.demo),
      broken: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results = await Promise.all(checks.map(runCheck));
  console.log(JSON.stringify({ baseUrl, results }, null, 2));

  if (results.some((result) => result.broken || !result.ok)) {
    process.exitCode = 1;
  }
}

main();

export {};
