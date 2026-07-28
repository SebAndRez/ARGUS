/**
 * src/lib/database-target/index.ts
 *
 * Barrel export for the target-schema type declarations. Re-exports the 5
 * domain files (`shared.ts`, `identity.ts`, `incident.ts`, `help.ts`,
 * `resource.ts`, `ice.ts`) as a single import surface for future
 * adapter/repository code (`ARGUS_DATABASE_COMPATIBILITY_LAYER_PLAN_v1.0.md`
 * §2).
 *
 * NOT a Prisma client. NOT imported by any existing runtime code — this
 * whole directory is isolated types only, with zero runtime wiring, per
 * the Compatibility Layer Plan's explicit scope boundary ("no crea/modifica
 * ninguna migración real, no toca `prisma/schema.prisma`... no ejecuta SQL").
 */

export * from "./shared";
export * from "./identity";
export * from "./incident";
export * from "./help";
export * from "./resource";
export * from "./ice";
