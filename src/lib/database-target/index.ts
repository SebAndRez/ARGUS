/**
 * src/lib/database-target/index.ts
 *
 * Barrel export for the target-schema type declarations. Re-exports the 10
 * domain files (`shared.ts`, `identity.ts`, `institution.ts`,
 * `jurisdiction.ts`, `evidence.ts`, `incident.ts`, `help.ts`, `mission.ts`,
 * `resource.ts`, `alert.ts`, `ice.ts`) as a single import surface for
 * adapter/repository code (`ARGUS_DATABASE_COMPATIBILITY_LAYER_PLAN_v1.0.md`
 * §2). Functional adapters (transform + shadow-write + reconciliation) for
 * these same 10 domains live under `./adapters/`, imported separately —
 * this barrel is types only.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code — this
 * whole directory is isolated types only, with zero runtime wiring, per
 * the Compatibility Layer Plan's explicit scope boundary ("no crea/modifica
 * ninguna migración real, no toca `prisma/schema.prisma`... no ejecuta SQL").
 */

export * from "./shared";
export * from "./identity";
export * from "./institution";
export * from "./jurisdiction";
export * from "./ingest";
export * from "./evidence";
export * from "./incident";
export * from "./help";
export * from "./mission";
export * from "./resource";
export * from "./alert";
export * from "./ice";
