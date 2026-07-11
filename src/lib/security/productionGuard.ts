/**
 * Central production-environment check for ARGUS Operational Stabilization
 * (v1.0.3.1) — reused wherever seed/demo data could otherwise leak into a
 * live deployment (Chile alerts `?seed=true`, Global Watch `?seed=true`,
 * `/api/argus/events` forced demo mode).
 *
 * Prefers `VERCEL_ENV` over `NODE_ENV`: Vercel sets `NODE_ENV=production`
 * for *every* build it runs, including preview deployments — `VERCEL_ENV`
 * is the only reliable signal that a request is actually hitting the
 * production deployment. Falls back to `NODE_ENV` for non-Vercel
 * environments (plain `next start`, CI) where `VERCEL_ENV` is unset.
 */
export function isProductionEnvironment(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

/**
 * Seed/demo data (QA fixtures, `seedMode` ingestion runs, forced curated
 * fallback datasets) must never run silently in production. This is the
 * single explicit escape hatch for the rare case an operator deliberately
 * wants demo data on a production deployment (e.g. a scheduled live demo
 * walkthrough) — mirrors the existing `ARGUS_EVENTS_DEMO_MODE` opt-in
 * pattern already documented in `.env.example`, not a new mechanism.
 */
export function isDemoDataAllowed(): boolean {
  if (!isProductionEnvironment()) return true;
  return process.env.ARGUS_ALLOW_DEMO_DATA === "true";
}
