# ARGUS Security Audit

Fecha: 2026-07-01.
Rama: `phase-3-ui-ux`.

## Estado General

ARGUS usa Next.js App Router, Prisma y Supabase PostgreSQL. La autenticacion
actual es cookie custom server-side, no Supabase Auth. Por eso no se aplico RLS
automaticamente en esta tarea.

## Prisma

Proveedor DB: PostgreSQL.

Modelos existentes:

- `User`: sensible. Email, `governmentIdHash`, Google sub, rol, estado,
  reputacion y auditoria. Requiere auth/RBAC/RLS o proteccion por API.
- `Report`: sensible parcial. Ubicacion, descripcion y usuario. Publico solo
  sanitizado/agregado.
- `HelpRequest`: sensible alto. SOS, ubicacion, prioridad, modo restringido.
  Requiere auth, auditoria y cuidado especial. SOS no debe bloquearse totalmente.
- `AuditLog`: sensible. Solo admin/operador.
- `Sanction`: sensible. Solo admin/operador; requiere revision humana.
- `ExternalEvent`: fuente externa. Puede exponerse sanitizado.
- `IngestionRun`: operacional. No debe exponer errores con secretos.
- `ExternalEventCorrelation`: operacional. Puede exponerse agregado.
- `RiskAssessment`: estimacion ARGUS. Debe etiquetarse como estimacion.
- `RiskAssessmentRevision`: auditoria operacional.
- `HazardKnowledgeDocument` y `HazardKnowledgeFact`: conocimiento/fuentes.
  Exponible si no contiene datos sensibles.

No se encontraron modelos persistentes para Profile, MedicalProfile,
EmergencyContact, QuakeSense, MobileSafety o SensorSafety. Esas areas son
runtime/demo o estan documentadas como pendientes.

## User Audit

Reglas:

- `email` es unique.
- `googleSub` es unique opcional.
- `governmentIdHash` es unique opcional.
- Google login autentica, no reemplaza verificacion RUT/ID.
- RUT/ID no debe mostrarse publicamente.
- Usuarios sin RUT/ID pueden tener acceso limitado.
- SOS no debe bloquearse por falta de RUT/ID.

Brechas:

- Auth custom no tiene tabla Session.
- No hay expiracion verificada server-side mas alla del payload de cookie.
- `AUTH_SECRET`/`SESSION_SECRET` debe existir en produccion.
- RLS no puede depender de `auth.uid()` hasta migrar a Supabase Auth o claims
  compatibles.

## Auth Audit

- Cookies de sesion: `httpOnly`, `sameSite=lax`, `secure` en produccion.
- Logout limpia cookie.
- Login local demo por email no usa password, por diseno de demo; no apto para
  produccion publica sin factor seguro.
- Google OAuth genera `state`, valida callback y borra cookie temporal.
- Scopes Google: `openid email profile`.
- No se guarda access token en frontend.
- Errores de Google se muestran por query param y login los traduce.

## Endpoints Sensibles

- `/api/users`: requiere RBAC antes de produccion.
- `/api/reports`: ubicacion y descripcion; publico solo sanitizado.
- `/api/help-requests`: SOS sensible; auth requerida pero SOS no bloqueable por
  reputacion.
- `/api/missing-persons`: sensible potencial; requiere sanitizacion/RBAC.
- `/api/medical-aid`: medico/demo; no persistir sensible sin RLS.
- `/api/command/*`: institucional; requiere OPERATOR/ADMIN.
- `/api/incidents`: puede mezclar fuentes y senales; sanitizar datos personales.
- `/api/trust/*`: no exponer email/RUT/telefono.
- `/api/mobile-safety/*`, `/api/sensor-safety/*`, `/api/quakesense/*`: demo o
  runtime; no usar para sanciones automaticas.

## Helpers Creados

- `src/types/rbac.ts`
- `src/lib/security/rbac.ts`
- `src/lib/security/apiGuards.ts`
- `src/lib/security/sanitizers.ts`
- `src/types/privacyConsent.ts`
- `src/types/accessControl.ts`
- `src/lib/access/accessPolicy.ts`
- `src/lib/access/accessAudit.ts`
- `src/lib/security/securityHeaders.ts`
- `src/lib/security/rateLimitPolicy.ts`

## Riesgos Criticos

- Produccion con login local por email no es suficientemente fuerte.
- Datos medicos/contactos de emergencia no deben persistirse hasta tener RLS,
  auditoria, consentimiento y roles.
- Command Center debe mantenerse RBAC.
- RLS debe probarse en staging antes de activarse.

## Recomendacion

Proteger datos sensibles por API server ahora. Migrar gradualmente a Supabase
Auth o claims compatibles antes de RLS profunda.
