# Supabase RLS Strategy

## Estado Actual

ARGUS usa Prisma con Supabase PostgreSQL y autenticacion custom por cookie
server-side. No usa Supabase Auth como fuente primaria de identidad.

## Por Que No Aplicar RLS Generico Todavia

Las policies basadas en `auth.uid()` podrian romper runtime porque las consultas
Prisma server-side no llegan con JWT Supabase del usuario. Activar RLS sin plan
puede bloquear reportes, SOS, dashboard o fuentes.

## Opciones

1. Migrar gradualmente a Supabase Auth.
2. Mantener cookie custom y proteger todo por API server.
3. Usar service role solo server-side, nunca cliente.
4. Crear RLS solo para tablas publicas/agregadas.
5. Probar todo en staging antes de produccion.

## Recomendacion

Fase actual: proteger por API server, RBAC y sanitizers. No exponer cliente
Supabase directo para tablas sensibles. Preparar migracion a Supabase Auth si se
requiere RLS por usuario.

## Tablas Que Necesitan RLS

- User
- Report
- HelpRequest
- AuditLog
- Sanction
- futuros UserProfile, EmergencyContact, MedicalEmergencyProfile,
  UserPrivacySettings, ConsentRecord, SafetyCheck persistente.

## Tablas Exponibles Solo Agregadas O Sanitizadas

- ExternalEvent
- ExternalEventCorrelation
- RiskAssessment
- HazardKnowledgeDocument
- HazardKnowledgeFact

## Pruebas De Acceso Negativo

- Usuario A no lee perfil de usuario B.
- Publico no lee email/RUT/telefono.
- Publico no lee datos medicos.
- Citizen no lee AuditLog ni Sanction.
- Operator no accede a datos medicos sin rol medico/admin.
- API client suspendido no recibe datos.
