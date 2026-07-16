# ARGUS — Deuda técnica remanente (estado tras Prompt 20)

> Documento nuevo, no copiado de `docs/audit/ARGUS_TECHNICAL_DEBT.md` (que
> se conserva intacto como registro histórico "estado al 13 de julio de
> 2026"). Solo incluye lo que sigue vigente después de esta tarea.

## P0 — Ninguno

Ningún hallazgo P0 sobrevive esta tarea. El build falla en `/dashboard`
(ver P1) pero es un problema preexistente de un archivo (`AtlasDashboard.tsx`)
que esta tarea no tocó ni tiene mandato para rediseñar.

## P1 — Alto

1. **Build de producción falla en el prerender de `/dashboard`** —
   `useSearchParams()` sin límite de Suspense en `AtlasDashboard.tsx`
   (confirmado preexistente: el archivo ya aparecía modificado/sin commitear
   antes de que esta tarea empezara). `npm run test`/`test:p0`/`typecheck`/
   `lint` pasan limpio; solo `next build`'s prerendering falla. Corregirlo
   requiere envolver el consumidor de `useSearchParams` en `<Suspense>` en
   `src/app/dashboard/page.tsx` o en `AtlasDashboard.tsx` — cambio de
   estructura de módulo, fuera del alcance de esta tarea de limpieza
   (`AtlasDashboard.tsx` no está en la lista de archivos permitidos).

## P2 — Medio

1. **51 helpers de contexto GVP/IOC/NOAA/OpenAQ/tsunami/volcán en
   cuarentena** (`src/lib/{aura,fenix,nav,risk,ocean,tsunami,volcano,
   wildfire,tropical-cyclone,command-center}/*Context.ts`) — código de
   dominio real y no trivial, cero consumidores, cero tests. No son stubs;
   representan la mitad de una integración de fuente que nunca se conectó a
   un módulo consumidor. Candidatos a: (a) conectar a AURA/FÉNIX/HERMES/etc.
   en una tarea de producto futura, o (b) mover a un área explícitamente
   `experimental` si en 2+ ciclos futuros nadie los conecta. Lista completa
   en `ARGUS_DELETION_EVIDENCE.md`.
2. **Geometría chilena ~1.13MB en el bundle cliente** — confirmado que
   sigue llegando al cliente vía `page.tsx` → `demoArgusEvents.ts` →
   `argusGeometryResolver.ts`. Arreglarlo (lazy-load o resolución
   server-side) toca el timing de inicialización de estado del mapa
   principal — riesgo de comportamiento no acotado para una tarea de
   limpieza. Documentado como bloqueo explícito (Prompt 20 §27 lo permite:
   "si requiere rediseño... no lo implemente; documente el bloqueo").
3. **6 rutas API sin consumidor encontrado en el repo** —
   `/api/external-events`, `/api/conflict-events`, `/api/conflict-zones`,
   `/api/command/sources`, `/api/news-evidence`, `/api/quakesense/clusters`.
   No se eliminaron porque el prompt prohíbe explícitamente retirar una API
   pública sin poder descartar consumo externo/manual desde un grep
   solo-repo. Candidatas para una futura auditoría de rutas con mayor
   certeza (posiblemente vía métricas de acceso en producción).
4. **20 warnings `react-hooks/set-state-in-effect`** — todos preexistentes
   (ninguno introducido por este prompt ni por los anteriores; mismo patrón
   ya presente en el panel `/admin/source-health` ya en producción).
   Archivos: `src/hooks/useNavigationSession.ts`, `useLiveMedicalRoute.ts`,
   `useUserLocation.ts`, `src/app/app/page.tsx` (múltiples), y varios
   dashboards de módulo. Corregir cada uno requiere decidir por-hook si el
   estado puede derivarse durante el render, necesita lazy state, o
   realmente corresponde a un efecto — el prompt explícitamente advierte no
   apresurar esto ("no introduzca loops de render", "no reescriba
   componentes completos por warnings cosméticos"). Recomendado como una
   tarea dedicada futura, hook por hook, con tests de regresión por cada
   cambio.
5. **`reason` no persistido en `applyStrike()`** (`src/services/
   reputationService.ts`) — el parámetro existe en la firma pública y los
   llamadores ya lo pasan, pero no hay columna en Prisma para guardarlo;
   hoy se descarta silenciosamente. Requiere migración de esquema
   (`defer_requires_migration`, fuera de alcance).

## P3 — Bajo

1. **Colisión de nombres conceptual**: `knowledgeMemoryEngine.ts`'s array en
   memoria `embeddingRecords` (demo) vs. la tabla Prisma real (ahora
   huérfana en escritura) `KnowledgeEmbeddingRecord`. Nombres casi
   idénticos, propósitos distintos — confuso pero no incorrecto. Renombrar
   el array demo tocaría múltiples archivos por un problema cosmético;
   documentado, no renombrado.
2. **Modelo Prisma `ExternalEventCorrelation`** — sin escritor activo tras
   esta tarea (su única función escritora, `persistCorrelations()`, se
   eliminó por no tener llamador). El modelo permanece intacto (cero
   cambios de esquema); si se decide que la funcionalidad de correlación
   persistida es necesaria, requiere una función escritora nueva conectada
   a un llamador real, no solo restaurar la antigua.
3. **Duplicación superficial de componentes de tarjeta** (`VigiaReportCard`,
   `TalosRiskCard`, `ArcaShelterCard`, `HermesRouteCard`) — contenedor/
   encabezado similares, pero cuerpo genuinamente distinto por dominio (p.
   ej. ARCA tiene diseño de doble-botón que no encaja en un shell único).
   Extraer una base compartida agrega más riesgo visual que el ahorro de
   ~5 líneas por archivo justifica — no se tocó, per el criterio explícito
   del prompt de no consolidar si aumenta riesgo.
4. **9 stores en memoria `globalThis`-backed** (mobile-safety, sensor-safety,
   quakesense) — ya correctamente autoetiquetados `runtime_placeholder`/
   `persistent: false`, ya documentados. Sin acción necesaria, solo
   inventariado aquí para que quede explícito que fueron revisados.

## Ya resuelto — no requiere acción (verificado, no asumido)

- Resumen de notificaciones: una sola implementación activa, sin
  duplicación cliente/servidor (el documento de auditoría original estaba
  desactualizado en este punto).
- Command Center sintético: ya falla cerrado, ya etiquetado, ya
  documentado — nada que corregir.
- `alertPromotionEngine.ts`: colisión resuelta por renombre (ver
  `ARGUS_TECHNICAL_DEBT_CLOSURE.md`).
- 33 tests de convención propia: convertidos, 329 aserciones nuevas
  ejecutándose realmente.
