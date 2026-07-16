import { assertSafeDatabaseForSeed } from "./lib/databaseSafety";

/**
 * Defensa en profundidad para el comando npm `db:seed` — se ejecuta ANTES
 * de `tsx prisma/seed.ts` en `package.json`. No es la protección
 * principal: `prisma/seed.ts` valida el mismo destino de forma
 * independiente al arrancar, para cubrir tambien invocaciones directas
 * (`tsx prisma/seed.ts`, `npx prisma db seed`) que no pasan por npm.
 */
assertSafeDatabaseForSeed();
console.log("Guard de seed superado. Continuando con prisma/seed.ts.");
