# ARGUS Release Audit

Fecha de auditoria: 2026-06-30 / America-Santiago.
Rama auditada: `phase-3-ui-ux`.

## Alcance

Esta auditoria se ejecuto despues de agregar:

- ARGUS QuakeSense Web/PWA experimental.
- ARGUS Mobile Safety Agent fase 2 demo.
- Capas de mapa `Sacudida ciudadana` y `Safety Checks`.
- Endpoints demo para QuakeSense y Mobile Safety.

No se hizo deploy, push, migracion destructiva ni exposicion de secretos.

## Cambios Implementados Antes De Auditar

### QuakeSense

- Tipos `QuakeSense*`.
- Hook `useQuakeSenseMotion`.
- Detector local heuristico de sacudidas.
- Sanitizacion/privacidad de senales.
- Store runtime/in-memory para senales y clusters.
- APIs:
  - `GET /api/quakesense/clusters`
  - `GET/POST /api/quakesense/signals`
- Panel `ARGUS QuakeSense` en `Modulos`.
- Capa de mapa `Sacudida ciudadana`.
- Adaptador a incidentes `earthquake_sensor`.

Lenguaje usado: alerta preliminar, posible sacudida detectada, estimacion
ARGUS, pendiente de confirmacion oficial, experimental.

### Mobile Safety Agent

- Tipos `MobileSafety*` y `SafetyCheck`.
- Store runtime/in-memory para settings, eventos y check-ins.
- APIs:
  - `GET/PATCH/POST /api/mobile-safety/settings`
  - `POST /api/mobile-safety/quake-event`
  - `GET/POST/PATCH /api/mobile-safety/check-in`
  - `POST /api/mobile-safety/escalate`
- Panel `Mobile Safety Agent` en `Modulos`.
- Modal de safety check.
- Preview de notificacion.
- Capa de mapa `Safety Checks`.
- Adaptador a incidentes `mobile_safety`.

No implementa push real, sensores nativos, background sensing ni contacto con
servicios de emergencia.

## Validaciones Ejecutadas

### Git

- Rama verificada: `phase-3-ui-ux`.
- No se detectaron `.env`, `.env.local` ni `.vercel` staged.

### Prisma

- `npx prisma validate`: paso.
- `npx prisma generate`: paso.
- `npx prisma migrate status`: paso con red permitida.
- Estado reportado: 4 migraciones encontradas y base al dia.
- Intento inicial sin red permitida fallo por engine/conectividad; no indica
  problema de schema.

### Supabase Read-only

Script: `scripts/auditUsersReadOnly.ts`.

Resultado con red permitida:

- users: 1
- reports: 0
- helpRequests: 0
- auditLogs: 1
- sanctions: 0
- externalEvents: 395
- riskAssessments: 18
- usuarios por estado: ACTIVE = 1
- usuarios por rol: CITIZEN = 1

El script no imprime emails, telefonos, hashes de documento ni secretos.

### Build

- `npm.cmd run build`: paso.
- Prisma Client generado correctamente.
- Next build completo con TypeScript exitoso.

### Lint

- `npm.cmd run lint`: fallo.
- Resultado: 46 problemas, 38 errores y 8 warnings.
- Errores principales:
  - ESLint revisa `.vercel/output/...` y reporta `require()`.
  - `any` existentes en rutas admin/users/report/help y `prisma/seed.ts`.
  - Reglas nuevas de React Compiler sobre `setState` en effects.
  - Acceso a refs durante render en `OperationalMap`.
  - `useQuakeSenseMotion` tambien activa `react-hooks/set-state-in-effect`.

Concluson: build esta sano, pero lint no esta listo para gate de release.

### Smoke HTTP Local

Con servidor local y red permitida:

- `GET /api/events`: 200
- `GET /api/ingest/status`: 200
- `GET /api/command/overview`: 200
- `GET /api/incidents?limit=5`: 200
- `GET /api/quakesense/clusters`: 200
- `GET /api/mobile-safety/settings`: 200
- `GET /api/mobile-safety/check-in`: 200
- `POST /api/quakesense/signals`: 200
- `POST /api/mobile-safety/quake-event`: 200

Paginas:

- `/app`: 200
- `/dashboard`: 200
- `/dashboard/fenix`: 200
- `/login`: 200
- `/register`: 200

Sin red permitida, `/api/events` dio 500 por no alcanzar Supabase. Con red
permitida paso, por lo que se clasifica como limitacion del sandbox.

### Diff Check

- `git diff --check`: paso sin whitespace errors.
- Git aviso normal de conversion LF -> CRLF en Windows.

### Vercel

- `vercel env ls production` respondio autenticado para el proyecto.
- La salida no mostro nombres ni valores de variables.
- No se imprimieron secretos.

## Auditoria De Producto

### Demo vs Real

Partes reales o conectadas a fuentes reales:

- Supabase PostgreSQL.
- USGS, GDACS, NOAA, MET Norway, NASA FIRMS si hay key.
- Login local y base Google OAuth.

Partes demo/fallback/runtime:

- QuakeSense signals/clusters en memoria runtime.
- Mobile Safety Agent en memoria runtime.
- Fenix Twin demo.
- AURA medical points demo.
- Rutas y clima/riesgo visual demo.
- Reportes demo masivos.
- Conflict zones curadas/demo.
- ReliefWeb oculto temporalmente en UI.

Nada de lo anterior debe presentarse como oficial o persistente sin trabajo
adicional.

### Seguridad Y Secretos

- `.gitignore` protege `.env*`, `.env*.local`, `.vercel`, `.next` y logs.
- `.env.example` solo contiene placeholders.
- No se imprimieron valores de `DATABASE_URL`, `DIRECT_URL`,
  `NASA_FIRMS_MAP_KEY`, Google secrets ni auth secrets.
- El script read-only carga `.env.local` con prioridad sobre `.env` y no expone
  valores.

### Riesgos Reales Detectados

- `package.json` mantiene scripts destructivos:
  - `db:setup`: usa `prisma db push`.
  - `db:reset`: usa `prisma db push --force-reset`.
  Estos scripts son peligrosos si se ejecutan contra Supabase.
- Lint no esta limpio.
- `.vercel/output` entra en lint aunque `.vercel` este en `.gitignore`; falta
  configuracion explicita de ESLint ignore o limpieza de output local.
- Algunos modulos importantes siguen siendo demo/local y podrian confundirse si
  no se etiquetan claramente.
- QuakeSense usa APIs de sensor con soporte variable en iOS Safari.
- `crypto.randomUUID` esta protegido, pero el fallback usa `Math.random` para
  id efimero de demo; aceptable por ahora, no apto para identidad o seguridad.
- No hay RLS avanzado ni politicas Supabase completas documentadas como
  terminadas.

## Estado De Release

Estado tecnico:

- Build: apto.
- TypeScript: apto.
- Prisma schema: apto.
- Supabase read-only: apto con red.
- Smoke HTTP: apto con red.
- Lint: no apto.

Recomendacion:

No hacer release final con lint como gate hasta corregir o configurar los
errores reportados. La app puede seguir en iteracion funcional porque build y
smoke pasaron.

## Update - Hardening Phase

Added release hardening items:

- ESLint now ignores generated `.vercel`, `.next`, `out`, `dist` and coverage
  artifacts.
- Dangerous DB scripts were renamed to local-danger names and guarded.
- `release:check` was added as a non-destructive validation gate.
- Product status taxonomy was added for REAL, OFFICIAL_SOURCE, ARGUS_ESTIMATE,
  EXPERIMENTAL, DEMO, RUNTIME_ONLY, FUTURE and DISABLED.
- Privacy baseline, RLS plan, release gate and mobile QA checklist were added.

Final validation after Trust, Sensor Safety and hardening:

- `npm.cmd run lint`: passed with warnings, 0 errors.
- `npm.cmd run build`: passed.
- `npx.cmd prisma validate`: passed.
- `npx.cmd prisma generate`: passed.
- `npx.cmd prisma migrate status`: passed with network permission; DB up to date.
- `git diff --check`: passed; Windows LF/CRLF warnings only.
- Smoke local passed for `/app`, `/dashboard`, `/dashboard/fenix`, `/profile`,
  `/api/events`, `/api/ingest/status`, `/api/quakesense/clusters`,
  `/api/mobile-safety/settings`, `/api/sensor-safety/*`, `/api/trust/*`,
  `/api/command/overview` and `/api/incidents`.

Remaining warnings are tracked as non-blocking cleanup:

- React Compiler `set-state-in-effect` warnings in existing app/map/hooks.
- Minor unused variable warnings in existing files.

## Update - User Guide And Profile Prepared UI

Added two safety-oriented product sections without deploy, push or commit:

- `/app/como-usar`: complete Spanish user guide for citizens, communities,
  volunteers, operators and institutions.
- `/app/perfil`: prepared profile workspace for public identity, private
  contact, emergency contact, optional medical data and privacy preferences.

Links were added from `/app` and `/dashboard` so both sections are discoverable.

### User Guide Coverage

- ARGUS purpose and limits.
- Map, layers, report types, sources, validation, reputation and sanctions.
- SOS doctrine: emergency use only, never blocked by reputation.
- Safety Check doctrine: useful for status, not a replacement for emergency
  contact.
- Scenario guidance for earthquakes, tsunamis, fires, floods, storms, medical
  emergency, lost or isolated persons, communication outages, conflict/security
  crisis, evacuation and mass events.
- Remote connectivity guidance for satellite internet or Starlink-like links.
- Clear status separation: real, official, external, citizen, ARGUS estimate,
  experimental, demo, runtime and future.

### Profile Coverage

- Public profile fields and visibility.
- Private contact fields.
- Emergency contact with consent.
- Optional medical fields with privacy warnings.
- Privacy and security preferences.
- Account/trust summary only; users cannot edit reputation or sanctions.

No sensitive profile persistence, Prisma migration or public profile API was
introduced in this step. This is intentional: storing medical/contact data
requires RLS, roles, audit trails, consent versioning and data deletion/export.

### New Documentation

- `docs/ARGUS_USER_GUIDE.md`
- `docs/ARGUS_PROFILE.md`
- `docs/ARGUS_PROFILE_PRIVACY_AND_RLS.md`
- `docs/ARGUS_PROFILE_TODO.md`
- `docs/ARGUS_PROFILE_QA.md`

### Release Impact

This update improves product clarity and user safety. It does not change SOS,
reporting, sanctions, Supabase schema, external sources or deployment settings.

### Validation For This Update

- `npm.cmd run lint`: passed with 15 warnings and 0 errors. Warnings are the
  existing React Compiler/state-in-effect and minor unused-variable debt already
  tracked in this audit.
- `npx.cmd prisma validate`: passed.
- `npx.cmd prisma generate`: initially failed with Windows `EPERM` because a
  local Node process was holding Prisma's query engine DLL; after stopping local
  Node processes, it passed.
- `npm.cmd run build`: passed after Prisma Client regenerated.
- `npx.cmd prisma migrate status`: did not complete from the sandbox and returned
  a migration engine error while trying to reach Supabase. No migration,
  destructive command or schema change was executed.
- `git diff --check`: could not be executed in this run because Git requires
  elevated safe-directory access under the sandbox user and the approval request
  was rejected by the environment usage limit.

Manual follow-up before commit:

- Re-run `git diff --check`.
- Re-run `git status --short`.
- Optionally re-run `npx.cmd prisma migrate status` from a terminal with normal
  network access.

## Update - Sprint 1 Release Gate / Preview Controlada

Fecha: 2026-07-01.

Estado general: LISTO PARA PREVIEW CONTROLADA, no production-ready.

### Validaciones Ejecutadas

- Rama: `phase-3-ui-ux`.
- Working tree inicial: limpio.
- Ultimo commit antes del sprint: `ac3f2c7`.
- `npx.cmd prisma validate`: paso.
- `npx.cmd prisma generate`: paso.
- `npx.cmd next build`: paso.
- `npm.cmd run lint`: paso con 15 warnings conocidos y 0 errores.
- `git diff --check`: paso; solo warnings LF/CRLF de Windows.
- `npm.cmd run release:check`: paso.
- Secret scan sobre archivos versionables/no ignorados: sin hallazgos.
- `npx.cmd prisma migrate status`: paso con red permitida; 4 migraciones y DB al dia.

### Rutas Smoke

Pasaron HTTP 200:

- `/`
- `/app`
- `/login`
- `/register`
- `/dashboard`
- `/dashboard/fenix`
- `/app/como-usar`
- `/app/perfil`
- `/legal/terms`
- `/legal/privacy`
- `/legal/data-license`
- `/legal/institutional-access`

### APIs Smoke

Sin roturas criticas con red permitida:

- `/api/auth/me`
- `/api/session`
- `/api/reports`
- `/api/help-requests`
- `/api/missing-persons`
- `/api/external-events`
- `/api/events`
- `/api/ingest/status`
- `/api/conflict-zones`
- `/api/conflict-events`
- `/api/news-evidence`
- `/api/risk-assessments?limit=3`
- `/api/knowledge/facts?hazardType=tsunami&country=Chile`
- `/api/knowledge/documents?hazardType=tsunami&country=Chile`
- `/api/command/overview`
- `/api/command/sources`
- `/api/incidents`
- `/api/incidents?limit=5`
- `/api/fenix/scenarios`
- `/api/fenix/shelters`
- `/api/routing-intelligence/routes`
- `/api/medical-points`
- `/api/quakesense/clusters`
- `/api/mobile-safety/settings`
- `/api/sensor-safety/settings`
- `/api/trust/profile` devolvio 401 JSON valido, esperado sin sesion.

Endpoints GET con 405 esperado por ser POST-only/no GET:

- `/api/fenix/simulation`
- `/api/fenix/action-plan`
- `/api/medical-aid`

### Google OAuth Code Check

- `state` se genera una vez en start route.
- Callback valida `state`.
- Callback borra cookie temporal.
- Scopes: `openid email profile`.
- No usa `gapi/platform.js`.
- No guarda access token en frontend.
- Login tiene mensajes para `missing_config`, `redirect_mismatch`,
  `org_internal`, `invalid_state`, `token_error`, `callback_error`.

## Update - Sprint 2 Product Lock / Legal / Access Hardening

Se agrego base legal/comercial/tecnica de acceso:

- `docs/ARGUS_PLATFORM_LOCK.md`
- `docs/legal/TERMS_OF_USE_DRAFT.md`
- `docs/legal/PRIVACY_POLICY_DRAFT.md`
- `docs/legal/ARGUS_DATA_LICENSE_DRAFT.md`
- `src/types/accessControl.ts`
- `src/lib/access/accessPolicy.ts`
- `src/lib/access/accessAudit.ts`
- `src/lib/security/securityHeaders.ts`
- `src/lib/security/rateLimitPolicy.ts`
- `src/components/legal/LegalNoticeBanner.tsx`
- `src/components/legal/ArgusLegalFooter.tsx`
- paginas `/legal/terms`, `/legal/privacy`, `/legal/data-license`,
  `/legal/institutional-access`
- `POST /api/access/request`
- `public/robots.txt`

Protege ahora:

- Separacion ARGUS Core / Mobile / Command / API / Data.
- No scraping, no reventa, no extraccion masiva.
- Uso institucional/API requiere autorizacion formal.
- Dashboard/Fenix muestran aviso legal discreto.
- APIs sensibles pueden usar headers noindex/no-store.

Pendiente:

- API keys reales.
- Rate limit real con storage.
- Contratos definitivos.
- Revision legal formal.
- Watermarking de datos.

## Update - Sprint 3 Security / RLS / Auth / Roles / Sensitive Data

Se agrego base de seguridad sin aplicar RLS destructivo:

- `docs/ARGUS_SECURITY_AUDIT.md`
- `docs/SUPABASE_RLS_STRATEGY.md`
- `docs/ARGUS_CONSENT_MODEL.md`
- `docs/ARGUS_DATA_RIGHTS_PLAN.md`
- `src/types/rbac.ts`
- `src/lib/security/rbac.ts`
- `src/lib/security/apiGuards.ts`
- `src/lib/security/sanitizers.ts`
- `src/types/privacyConsent.ts`

Audit read-only de usuarios:

- users: 1
- usersWithGoogleSub: 1
- usersWithoutGoogleSub: 0
- usersWithEmailVerifiedAt: 1
- usersWithoutGovIdHash: 1
- usersWithEmptyRole: 0
- usersWithEmptyAccountStatus: 0
- possibleDuplicateEmailGroups: 0
- possibleDuplicateGovIdHashGroups: 0
- usersByStatus: ACTIVE = 1
- usersByRole: CITIZEN = 1

No se imprimieron emails, documento/hash, telefonos ni secretos.

Riesgo clave:

- RLS profundo no debe aplicarse todavia porque ARGUS usa cookie custom
  server-side, no Supabase Auth. Activar policies genericas basadas en
  `auth.uid()` podria romper Prisma/runtime. Recomendacion: proteger por API
  server ahora y migrar a Supabase Auth/claims o staging RLS por fases.

## Recomendacion Actual

- Web ready: si, para preview controlada.
- PWA ready: parcial; requiere QA real en iPhone/Android y politicas nativas.
- Production ready: no.
- Preview ready: si, con etiquetas demo/experimental y sin promesas oficiales.

## Update - Sprint 4 Source Operations

Se agrego monitoreo operacional de fuentes:

- `src/lib/sources/sourceRegistry.ts`
- `src/lib/sources/sourceHealthEngine.ts`
- `src/app/api/sources/status/route.ts`
- `src/lib/ingest/ingestJobTypes.ts`
- `src/lib/ingest/ingestJobRegistry.ts`
- `src/lib/ingest/retryPolicy.ts`
- `src/lib/ingest/deduplicationEngine.ts`
- `src/lib/ingest/eventNormalizer.ts`
- `src/components/sources/*`
- `scripts/auditSources.ts`
- `scripts/auditIngestEndpoints.ts`
- `docs/ARGUS_SOURCE_OPERATIONS_AUDIT.md`
- `docs/ARGUS_SOURCE_RELIABILITY.md`

`/api/ingest/status` ahora incluye `sourceHealth` y `/api/sources/status`
entrega registry sanitizado sin keys ni secretos.

Estado:

- Real: USGS, GDACS, NOAA, MET Norway, NASA FIRMS si key, ReliefWeb si app name.
- Demo/runtime: QuakeSense, Sensor Safety, camaras curadas, routing demo, medical
  points demo.
- Needs review: GDELT, ACLED, Liveuamap, Reuters/Bloomberg y fuentes pagadas o
  curadas.

No se creo scheduler real ni jobs infinitos.
