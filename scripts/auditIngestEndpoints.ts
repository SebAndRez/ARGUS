const baseUrl = process.env.ARGUS_AUDIT_BASE_URL ?? "http://127.0.0.1:3100";

const endpoints = [
  "/api/ingest/status",
  "/api/sources/status",
  "/api/ingest/usgs-earthquakes",
  "/api/ingest/gdacs-alerts",
  "/api/ingest/noaa-tsunami",
  "/api/ingest/nasa-firms",
  "/api/ingest/met-weather?lat=-33.45&lon=-70.66",
  "/api/ingest/reliefweb-reports",
];

async function check(path: string) {
  try {
    const response = await fetch(new URL(path, baseUrl), {
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
      path,
      status: response.status,
      ok: response.ok || [400, 401, 403, 503].includes(response.status),
      jsonValid,
      note:
        response.status === 503
          ? "Expected when optional key/config is missing."
          : undefined,
    };
  } catch (error) {
    return {
      path,
      status: "ERROR",
      ok: false,
      jsonValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results = await Promise.all(endpoints.map(check));
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

main();

export {};
