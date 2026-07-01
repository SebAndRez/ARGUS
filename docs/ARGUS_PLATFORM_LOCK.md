# ARGUS Platform Lock & Access Control Strategy

## Vision

ARGUS nace como una plataforma civil de seguridad y crisis orientada a salvar
vidas. Su capa publica permite reportar, recibir alertas, pedir ayuda, ver
riesgos y tomar mejores decisiones. Su capa institucional, ARGUS Command,
requiere autorizacion expresa, contrato, auditoria y condiciones de uso
estrictas.

Ninguna entidad publica, privada o gubernamental puede explotar, revender,
integrar, scrapear, automatizar o reutilizar datos de ARGUS sin permiso formal.

## Capas De Producto

### ARGUS Core

- Mapa ciudadano.
- Reportes.
- SOS.
- Alertas.
- Guia de uso.
- Acceso gratuito o publico controlado.

### ARGUS Mobile

- App movil futura.
- Safety Agent.
- QuakeSense.
- RoadSense.
- FallSense.
- Safety Check.
- Deteccion de no respuesta.

### ARGUS Command

- Dashboard institucional.
- Auditoria.
- Fenix.
- AURA Pro.
- Analisis avanzado.
- Acceso autorizado por rol, contrato y auditoria.

### ARGUS API

- API cerrada.
- API keys.
- Rate limits.
- Auditoria.
- No scraping.

### ARGUS Data License

- Uso limitado.
- No reventa.
- No extraccion masiva.
- No datasets derivados.
- No entrenamiento de modelos sin permiso.
- No uso institucional/gubernamental sin convenio.

## Uso Ciudadano Permitido

- Ver mapa y capas publicas.
- Reportar incidentes reales.
- Usar SOS en emergencia real.
- Usar Safety Check.
- Consultar fuentes y guia.
- Validar informacion cuando sea seguro.

## Uso Institucional Autorizado

Requiere convenio, roles, auditoria, alcance definido y limitaciones de datos.
ARGUS Command no debe tratarse como autoridad oficial ni como canal automatico
de despacho si esa integracion no existe.

## Uso Gubernamental No Autorizado

No se permite explotar, integrar, revender, automatizar o usar datos ARGUS sin
autorizacion formal. Esto incluye scraping, integraciones ocultas, vigilancia
ilegal o persecucion politica.

## Uso Prohibido

- Scraping.
- Extraccion masiva.
- Ingenieria inversa de API.
- Reventa de datos.
- Vigilancia ilegal.
- Persecucion politica.
- Targeting ofensivo.
- Uso como reemplazo de autoridad oficial.
- Entrenar modelos con datos ARGUS sin permiso.

## Protecciones

- Robots bloquea `/api`, `/dashboard`, `/profile`, `/app/perfil` y rutas
  sensibles. Esto reduce indexacion, no es seguridad real.
- Headers noindex/no-store para APIs sensibles.
- Politicas de acceso centralizadas en `src/lib/access/accessPolicy.ts`.
- RBAC y sanitizers preparados en `src/lib/security`.
- Rate limits documentados en `src/lib/security/rateLimitPolicy.ts`.
- Auditoria conceptual en `src/lib/access/accessAudit.ts`.

## Modelo Comercial Y Permisos

ARGUS Core puede ser publico/controlado. ARGUS Command, API, Data, AURA Pro,
Fenix institucional y routing avanzado requieren permiso formal, contrato,
auditoria, rate limits y condiciones de uso.

## Separacion Demo/Real

Funciones demo o experimentales deben mantenerse etiquetadas: QuakeSense,
Mobile Safety, Sensor Safety, RoadSense, FallSense, rutas demo, clima/riesgo
visual y Fenix/AURA cuando no tengan integracion real.

## Limitaciones Legales

Este documento no es asesoria legal definitiva. Antes de produccion publica se
requiere revision juridica, politica de privacidad final, terminos finales,
licencia de datos, DPA si aplica y estrategia de derechos de datos.

## Proximos Pasos

- API keys y rate limits reales.
- Registro de accesos institucionales.
- Contratos y plan comercial.
- RLS y roles verificados.
- Watermarking de respuestas de datos cuando exista ARGUS Data.
- Portal de solicitud institucional.
