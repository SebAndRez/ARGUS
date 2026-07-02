# ARGUS Release TODO

Prioridad sugerida para investigar sin borrar funcionalidad existente.

## P0 - Bloqueantes De Release Limpio

- Configurar ESLint para ignorar `.vercel/output`, `.next` y artefactos
  generados. Estado: implementado, validar con `npm.cmd run lint`.
- Revisar scripts destructivos de `package.json`:
  - `db:setup`
  - `db:reset`
  Estado: renombrados a comandos locales y protegidos con guard.
- Decidir politica oficial: lint debe pasar antes de deploy productivo o solo
  build/smoke por ahora.

## P1 - Calidad TypeScript / React

- Reemplazar `any` en rutas admin/users/report/help y `prisma/seed.ts`.
  Estado: errores directos corregidos.
- Revisar reglas `react-hooks/set-state-in-effect` en:
  - `src/app/app/page.tsx`
  - `src/app/login/page.tsx`
  - `src/hooks/useArgusEventAnalysis.ts`
  - `src/hooks/useUserLocation.ts`
  - `src/hooks/useQuakeSenseMotion.ts`
- Revisar acceso a refs durante render en `OperationalMap`.
  Estado: acceso directo a refs durante render corregido con estado de instancia.

## P1 - Warnings Restantes

- `react-hooks/set-state-in-effect` queda como warning, no error, por patrones
  existentes en mapa/GPS/login que requieren refactor dedicado.
- `src/app/api/events/route.ts` mantiene `severityMap` usado solo como tipo.
- `src/components/app/HelpRequestModal.tsx` mantiene `err` sin uso.
- `src/lib/prediction/riskEngine.ts` mantiene import sin uso.
- `src/lib/prisma.ts` mantiene eslint-disable redundante.
- `src/services/reputationService.ts` recibe `reason` para futura auditoria pero
  no lo usa todavia.

## P1 - Producto / Seguridad

- Separar visualmente en UI lo que es real, demo, runtime y futuro.
- Agregar banner o microcopy persistente para QuakeSense experimental.
- Confirmar politica de retencion para senales QuakeSense y Safety Checks antes
  de persistirlas.
- Mantener sanciones y reputacion fuera de cualquier automatismo QuakeSense o
  Safety.
- Revisar Trust & Achievements antes de version publica: endpoints, perfil
  publico, ausencia de datos sensibles y no gamificacion de SOS.
- Revisar Sensor Safety Suite antes de version publica: todo RoadSense/FallSense
  real requiere app nativa, permisos y politica de privacidad.

## P2 - Supabase

- Implementar RLS y roles cuando el producto pase de demo a datos reales.
- Documentar backups y recuperacion.
- Agregar auditoria avanzada para cambios administrativos.
- Validar que migraciones usen `DIRECT_URL` y runtime use pooler.

## P2 - QA Visual

- Probar manualmente en iPhone Safari:
  - `Modulos -> ARGUS QuakeSense`.
  - `Probar demo`.
  - capa `Sacudida ciudadana`.
  - `Mobile Safety Agent`.
  - modal Safety Check.
  - capa `Safety Checks`.
- Confirmar que SOS y Reportar no quedan tapados por modulos.
- Confirmar que el mapa no tiene overflow en 360, 390, 414 y 430 px.

## P3 - Futuro Controlado

- Persistencia real de QuakeSense/Safety solo despues de politica de privacidad.
- Jobs/reintentos para fuentes externas.
- Correlacion QuakeSense con USGS/CSN/SENAPRED/SHOA cuando existan datos.
- Native Android/iOS solo despues de especificacion de permisos, bateria y
  privacidad.

## P1 - Guia De Uso Y Onboarding

- Revisar manualmente `/app/como-usar` en 360, 390, 414 y 430 px.
- Agregar tutorial interactivo inicial cuando el flujo principal este estable.
- Preparar version offline o imprimible de la guia.
- Crear guia institucional y guia para comunidades rurales.
- Crear version para colegios, empresas y equipos voluntarios.
- Evaluar videos o infografias livianas.
- Traducir a otros idiomas cuando el contenido base este cerrado.

## P0 - Perfil, Privacidad Y Datos Sensibles

- No persistir datos medicos/contactos de emergencia hasta implementar RLS,
  roles y auditoria.
- Crear modelos Prisma separados para perfil publico, contacto privado, contacto
  de emergencia, perfil medico y privacidad.
- Implementar endpoints autenticados de perfil solo cuando haya pruebas de acceso
  negativo.
- Implementar exportacion/borrado de datos personales.
- Agregar consentimiento versionado.
- Definir flujo para unidades verificadas antes de mostrar datos
  `AUTHORIZED_UNITS_ONLY`.

## P1 - Perfil UX

- Conectar `/app/perfil` a backend seguro por secciones.
- Agregar validacion por campo y estados de guardado reales.
- Integrar preferencias con Safety Check cuando exista persistencia.
- Preparar lectura segura por SOS/AURA solo en emergencia y con autorizacion.
- Confirmar que reputacion no penaliza perfil incompleto.

## P1 - Validaciones Pendientes De Esta Corrida

- Repetir `git diff --check` desde terminal normal porque el sandbox no obtuvo
  aprobacion para acceso Git elevado.
- Repetir `git status --short` antes de cualquier commit.
- Repetir `npx.cmd prisma migrate status` con red normal si se necesita cerrar
  gate de base de datos; esta tarea no modifico Prisma ni ejecuto migraciones.

## P0 - Antes De Produccion Publica

- Problema: login local demo por email no es autenticacion fuerte.
  Archivo/componente: `src/app/api/auth/login/route.ts`.
  Impacto: acceso no apto para produccion abierta.
  Solucion: password/OAuth completo, magic link o Supabase Auth.
  Esfuerzo: M.

- Problema: datos medicos/contactos de emergencia no deben persistirse sin RLS.
  Archivo/componente: futuro perfil/AURA.
  Impacto: riesgo legal y privacidad.
  Solucion: modelos separados, RLS, auditoria, consentimiento versionado.
  Esfuerzo: L.

- Problema: Command Center sensible requiere RBAC enforcement endpoint por
  endpoint.
  Archivo/componente: `/api/command/*`, `/api/incidents`, `/dashboard`.
  Impacto: posible exposicion institucional si crece el dataset.
  Solucion: integrar `apiGuards` y pruebas de acceso negativo.
  Esfuerzo: M.

## P1 - Preview Controlada

- Problema: warnings React Compiler siguen activos.
  Archivo/componente: `src/app/app/page.tsx`, `src/hooks/*`,
  `src/components/map/OperationalMap.tsx`.
  Impacto: no bloquea build, pero ensucia gate.
  Solucion: refactor acotado de effects.
  Esfuerzo: M.

- Problema: endpoints POST-only aparecen como 405 en smoke GET.
  Archivo/componente: `/api/fenix/simulation`, `/api/fenix/action-plan`,
  `/api/medical-aid`.
  Impacto: no es crash, pero conviene documentar methods.
  Solucion: agregar `OPTIONS`/docs o GET health.
  Esfuerzo: S.

- Problema: visual mobile no fue validado con dispositivo real en esta corrida.
  Archivo/componente: `/app`, `/dashboard`, modulos.
  Impacto: preview movil requiere QA real.
  Solucion: probar iPhone Safari/Chrome Android y capturar checklist.
  Esfuerzo: M.

## P2 - Legal / API / Data

- Problema: documentos legales son drafts.
  Archivo/componente: `docs/legal/*`.
  Impacto: no apto para produccion comercial sin revision.
  Solucion: revision legal y publicacion de versiones finales.
  Esfuerzo: M.

- Problema: rate limits y API keys son conceptuales.
  Archivo/componente: `src/lib/security/rateLimitPolicy.ts`,
  `src/app/api/access/request/route.ts`.
  Impacto: API no debe abrirse publicamente.
  Solucion: implementar storage, API keys, quotas, audit logs.
  Esfuerzo: L.

## P3 - Futuro

- Problema: Data License no tiene watermarking ni contratos activos.
  Archivo/componente: ARGUS Data.
  Impacto: proteccion comercial incompleta.
  Solucion: watermarking, contratos y portal partner.
  Esfuerzo: L.

## P1 - Source Operations

- Problema: jobs de ingesta son declarativos, no programados.
  Archivo/componente: `src/lib/ingest/ingestJobRegistry.ts`.
  Impacto: health depende de consultas bajo demanda.
  Solucion: scheduler controlado con backoff y auditoria.
  Esfuerzo: M.

- Problema: health no persiste stale/error historico por fuente.
  Archivo/componente: `src/lib/sources/sourceHealthEngine.ts`.
  Impacto: Command Center no tiene tendencia temporal.
  Solucion: tabla/source run o extension de `IngestionRun`.
  Esfuerzo: M.

- Problema: fuentes conflict/media requieren revision legal.
  Archivo/componente: `docs/ARGUS_SOURCE_OPERATIONS_AUDIT.md`.
  Impacto: no usar en produccion sin terminos claros.
  Solucion: contratos/API oficiales o mantener como referencia.
  Esfuerzo: L.

## P0 - Mobile Antes De Produccion

- Problema: no existe app Android real.
  Archivo/componente: `docs/mobile/ANDROID_SAFETY_AGENT_SPEC.md`.
  Impacto: RoadSense/FallSense/background no son reales en web.
  Solucion: implementar app nativa Android con Foreground Service.
  Esfuerzo: XL.

- Problema: no hay FCM/APNs.
  Archivo/componente: `src/lib/mobile/pushPayloadBuilder.ts`.
  Impacto: push preview no envia notificaciones reales.
  Solucion: configurar FCM/APNs, tokens hash, rate limits y consentimiento.
  Esfuerzo: L.

- Problema: offline queue es contrato, no runtime real.
  Archivo/componente: `src/lib/mobile/offlineQueueContract.ts`.
  Impacto: no hay resiliencia offline mobile.
  Solucion: cola local cifrada nativa con WorkManager.
  Esfuerzo: L.

## P1 - Mobile QA

- Problema: manifest usa SVG existentes, no iconos PNG/maskable finales.
  Archivo/componente: `public/manifest.webmanifest`.
  Impacto: installability PWA puede ser parcial.
  Solucion: crear iconos 192/512 PNG maskable y apple touch icon.
  Esfuerzo: S.
## P0/P1 - Auth, Identity, I18N, Routes And Fenix

- P0: Add real email verification provider before public production.
- P0: Add audited email-change flow from authenticated profile.
- P0: Add terms/privacy acceptance timestamps in DB migration.
- P0: Confirm middleware gate behavior in Vercel preview and mobile Safari.
- P1: Expand i18n coverage across all remaining modules and legal pages.
- P1: Run `scripts/auditEncodingText.ts` and fix remaining mojibake manually.
- P1: Integrate official route datasets only after source/legal validation.
- P1: Add persisted Fenix simulation history after RLS and roles are complete.
- P1: Add visual Fenix map overlay for affected zones when the map contract is
  stable.

## P0 Follow-up - Auth And Fenix

- P0: Deploy and apply migration with `prisma migrate deploy`; do not use reset
  or db push.
- P0: Add password recovery provider before public release.
- P0: Add set-password flow for Google-created accounts.
- P0: Add real email verification provider.
- P0: Add audited email-change and document-change flows from authenticated
  profile.
- P0: Run owner/admin promotion script only from a trusted operator machine and
  verify session refresh.
- P1: Add country-specific document validators beyond Chile RUT.
- P1: Add real geocoder/settlement/census source for Fenix.
- P1: Replace Fenix demo routes/shelters/population with reviewed official or
  licensed open-data connectors.
- P1: Persist Fenix simulation history only after RLS, roles and audit policy
  are complete.
