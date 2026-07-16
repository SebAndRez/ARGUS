# ARGUS — mapa final del sistema

## Arquitectura ejecutable actual

```mermaid
flowchart LR
  Users["Usuarios web/PWA"] --> App["Next.js App Router\n168 route files / 188 methods"]
  App --> Map["Mapa 2D + Orbit\nPARCIAL / demo mezclado"]
  App --> Mods["11 módulos\nparcial/preview/planned"]
  App --> Auth["Sesión cookie HMAC\nOPERACIONAL CONTROLADO"]
  App --> API["API pública, auth, operador, cron"]

  GHA1["GitHub Global Watch\n15 min"] --> JobGW["/api/jobs/run-global-watch"]
  GHA2["GitHub Chile Alerts\n15 min"] --> JobCL["/api/jobs/run-chile-alerts"]
  JobGW --> Locks["Upstash locks/rate limit\nCONFIGURABLE; prod no verificada"]
  JobCL --> Locks
  JobGW --> Sources["8 fuentes scheduled"]
  JobCL --> SEN["SENAPRED"]
  Sources --> SEN
  Sources --> Normalize["Normalización/promoción/correlación"]
  SEN --> Normalize
  Normalize --> KI["KnowledgeIncident + KnowledgeEvidence\ncanónico parcial"]
  Normalize --> Runs["IngestionRun / Source Health"]

  DB[("PostgreSQL/Supabase\nestado productivo desconocido")]
  KI --> DB
  Runs --> DB
  API --> DB
  DB --> Project["Mapper canónico ArgusEvent"]
  Project --> API
  API --> Map
  API --> Mods
  API --> Notif["Notification engine"]

  Parallel["Report / HelpRequest / ExternalEvent / RiskAssessment\nmodelos paralelos"] --> DB
  Parallel --> Map
  Parallel --> Mods
  Demo["Datasets demo cliente/runtime"] --> Map
  Demo --> Mods

  API --> Obs["Health + snapshot + logs/buffer\nPARCIAL"]
```

## Flujo SENAPRED actual

```mermaid
sequenceDiagram
  participant GW as Global Watch cron :03/:18/:33/:48
  participant CA as Chile Alerts cron :07/:22/:37/:52
  participant L as senapred-ingestion lock
  participant S as Cliente único SENAPRED
  participant DB as KnowledgeIncident/Evidence

  GW->>L: adquirir
  L-->>GW: ok
  GW->>S: consulta
  S-->>GW: alertas
  GW->>DB: upsert/promote
  GW->>L: liberar
  CA->>L: adquirir (ya libre)
  L-->>CA: ok
  CA->>S: segunda consulta secuencial
  S-->>CA: mismas/nuevas alertas
  CA->>DB: segundo upsert/promote
  CA->>L: liberar
```

El lock impide concurrencia pero no el doble propietario. El objetivo correcto es una consulta lógica por ventana y un consumidor secundario de persistencia/resultado.

## Superficies de incidente

```mermaid
flowchart TD
  KI["KnowledgeIncident"] --> CM["canonicalKnowledgeIncidentToArgusEvent"]
  CM --> AE["/api/argus/events\nID chile-alert-*"]
  CM --> CE["/api/chile-alerts\nID chile-alert-*"]
  CM --> VE["/api/vigia/events\nID vigia-*"]
  CM --> MG["/api/modules/incidents\nID crudo"]
  AE --> MAP["Mapa/Orbit"]
  CE --> MAP
  VE --> MAP
  MG --> CORE["ATLAS/VIGÍA/ORÁCULO/TALOS"]
  R["Report/HelpRequest"] --> MAP
  R --> CORE
  X["Ingestores live/ExternalEvent"] --> MAP
  D["demoArgusEvents"] --> MAP
```

## Clasificación de componentes

| Componente | Estado |
|---|---|
| Auth cookie HMAC/guards | operacional controlado local |
| Prisma schema/migrations | válido; despliegue remoto no verificado |
| Mapper/lifecycle | operacional controlado por tests |
| Global Watch | parcial |
| Chile Alerts | parcial |
| Source scheduler/health | parcial |
| Wildfire correlation | operacional controlado por tests |
| Mapa/Orbit | demo/preview bloqueante |
| Notification engine | operacional controlado local |
| Observabilidad | parcial |
| Backup/restore | no verificado |
| NEXUS | stub/planned |
| Command Center | demo deshabilitado |
| Adapters retirados | retired/legacy eliminado del árbol actual |
