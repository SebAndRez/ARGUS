# ARGUS — Diagramas de la Entidad Canónica de Incidente

**Fecha**: 2026-07-14
**Documento hermano de**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md` (decisiones y justificación), `ARGUS_INCIDENT_MIGRATION_PLAN.md` (fases), `ARGUS_INCIDENT_FIELD_MAPPING.md` (matriz de campos).
**Tipo**: solo diagramas — no implementar.

---

## 1. Modelo conceptual (entidad-relación)

```mermaid
erDiagram
    Incident ||--o{ IncidentEvidence : "tiene"
    Incident ||--o{ IncidentAssessment : "tiene"
    Incident ||--o{ IncidentTransition : "historial"
    Incident ||--o{ IncidentRelation : "origen de"
    Incident ||--o{ Report : "correlaciona (FK opcional)"
    Incident ||--o{ HelpRequest : "correlaciona (FK opcional)"
    IncidentSource ||--o{ IncidentEvidence : "aporta"
    Incident ||--o| ArgusEvent : "proyecta (no persistido)"

    Incident {
        string id PK
        string canonicalKey
        string type
        string subtype
        string title
        string summary
        enum status
        enum sourceSeverity
        enum normalizedSeverity
        enum assessedSeverity
        enum effectiveSeverity
        int confidenceScore
        enum confidenceLevel
        enum verificationStatus
        enum scope
        string countryCode
        string regionCode
        json eventLocation
        json affectedArea
        json warningArea
        datetime startedAt
        datetime detectedAt
        datetime confirmedAt
        datetime resolvedAt
        datetime archivedAt
        datetime expiresAt
        int sourceCount
        int evidenceCount
        bool isOfficial
        bool isSynthetic
        bool isDemo
    }

    IncidentSource {
        string id PK
        string name
        enum type
        int reliabilityScore
        bool officialSource
        bool enabled
    }

    IncidentEvidence {
        string id PK
        string incidentId FK
        string sourceId FK
        string externalId
        enum evidenceType
        datetime publishedAt
        datetime observedAt
        datetime receivedAt
        json geometry
        string severityReported
        string statusReported
        int confidenceScore
        bool isPrimary
        bool isOfficial
        json metadataJson
    }

    IncidentAssessment {
        string id PK
        string incidentId FK
        string riskType
        string probabilityBand
        int probabilityScore
        int confidence
        string severity
        string recommendedAction
        json evidence
    }

    IncidentRelation {
        string id PK
        string fromIncidentId FK
        string toIncidentId FK
        enum kind
        int confidence
        string explanation
    }

    IncidentTransition {
        string id PK
        string incidentId FK
        string previousStatus
        string newStatus
        string previousSeverity
        string newSeverity
        string reason
        string actorId
        datetime createdAt
    }

    Report {
        string id PK
        string incidentId FK
        string userId FK
        string status
        string severity
    }

    HelpRequest {
        string id PK
        string incidentId FK
        string userId FK
        string status
        string priority
    }
```

**Nota de lectura**: `ArgusEvent` no tiene tabla — se representa como proyección de solo lectura para dejar explícito que ningún consumidor debe tratarlo como fuente de escritura.

---

## 2. Flujo de ingesta objetivo (end-to-end)

```mermaid
flowchart TB
    subgraph Fuentes["Fuentes"]
        F1[USGS / GDACS / EONET / FIRMS / ReliefWeb / EFFIS / Copernicus EMS]
        F2[SENAPRED Chile]
        F3[Reporte ciudadano / HelpRequest]
        F4[Otras ~20 fuentes hoy sin scheduler]
    end

    subgraph Ingesta["Ingesta y normalización"]
        N1["Adaptador por fuente<br/>(normaliza a IncidentEvidence candidata)"]
    end

    subgraph Correlacion["Identidad y correlación (§7 del diseño)"]
        C1{"¿Coincide canonicalKey<br/>con un Incident existente?"}
        C2["Adjuntar como nueva IncidentEvidence<br/>al Incident existente"]
        C3["Crear nuevo Incident<br/>(verificationStatus según origen)"]
    end

    subgraph Clasificacion["Clasificación (§9, §10 del diseño)"]
        S1["Clasificador único por sourceType<br/>→ normalizedSeverity"]
        S2["Recalcular effectiveSeverity"]
        S3["Recalcular confidenceScore / verificationStatus"]
    end

    subgraph Lifecycle["Lifecycle (§8 del diseño)"]
        L1["Evaluar transición de estado<br/>según ventana por tipo de amenaza"]
        L2["Registrar IncidentTransition<br/>si hubo cambio"]
    end

    subgraph Proyecciones["Proyecciones de consumo"]
        P1["canonicalIncidentToArgusEvent()<br/>(mapeador único)"]
        P2["Notificaciones<br/>(solo en las 6 transiciones definidas)"]
        P3["Módulos<br/>(ATLAS/VIGÍA/ORÁCULO/TALOS/HERMES/ARCA/...)"]
    end

    F1 --> N1
    F2 --> N1
    F3 --> N1
    F4 -.->|fuera de alcance mientras no tengan scheduler| N1

    N1 --> C1
    C1 -->|sí| C2
    C1 -->|no| C3
    C2 --> S1
    C3 --> S1
    S1 --> S2 --> S3 --> L1 --> L2

    L2 --> P1
    L2 --> P2
    P1 --> Map2D[Mapa 2D]
    P1 --> Orbit3D[Orbit 3D]
    L2 --> P3
```

---

## 3. Lifecycle canónico (máquina de estados)

```mermaid
stateDiagram-v2
    [*] --> DETECTED

    DETECTED --> VALIDATING: primera evidencia insuficiente
    DETECTED --> CONFIRMED: evidencia oficial única suficiente
    VALIDATING --> CONFIRMED: corroboración alcanzada
    VALIDATING --> REJECTED: expira sin corroborar / corroboración negativa

    CONFIRMED --> ACTIVE: dentro de ventana activeHours

    ACTIVE --> ESCALATING: severidad o alcance aumenta
    ACTIVE --> MONITORING: sin actualización > activeHours
    ACTIVE --> CONTAINED: fuente declara control

    ESCALATING --> ACTIVE: se estabiliza
    ESCALATING --> CONTAINED: fuente declara control

    MONITORING --> ACTIVE: nueva evidencia
    MONITORING --> RESOLVED: sin actualización > resolveHours

    CONTAINED --> RESOLVED: sin nueva evidencia de reactivación
    CONTAINED --> ACTIVE: evidencia de reactivación

    RESOLVED --> ARCHIVED: vencido periodo de gracia (resolveHours adicionales)
    RESOLVED --> ACTIVE: reapertura por nueva evidencia (reason=reopened_by_new_evidence)

    ARCHIVED --> ACTIVE: reapertura manual excepcional (auditada)

    DETECTED --> DUPLICATE: IncidentRelation(duplicate_of) confirmada
    VALIDATING --> DUPLICATE: idem
    CONFIRMED --> DUPLICATE: idem
    ACTIVE --> DUPLICATE: idem

    REJECTED --> [*]
    ARCHIVED --> [*]
    DUPLICATE --> [*]

    note right of RESOLVED
        Visible en UI, NO cuenta
        como activo en contadores
        ni en campana (corrige
        fatiga de alertas)
    end note

    note right of DUPLICATE
        No navegable directamente,
        redirige al Incident canónico
        vía IncidentRelation
    end note
```

---

## 4. Proyecciones de consumo (una fuente, múltiples lecturas)

```mermaid
flowchart LR
    INC[("Incident<br/>(fuente de verdad única)")]

    INC --> M["canonicalIncidentToArgusEvent()<br/>(mapeador único, reemplaza los 3 actuales)"]
    M --> Map2D["Mapa 2D<br/>ArgusEventLayer"]
    M --> Orbit3D["Orbit 3D<br/>GlobeView"]

    INC --> NT["Notification builder<br/>(triggers = transiciones, §15)"]
    NT --> Bell["Campana de notificaciones"]

    INC --> API["API canónica<br/>/api/incidents/*"]
    API --> Modules["Módulos verticales<br/>(ATLAS/VIGÍA/ORÁCULO/TALOS/HERMES/ARCA/FÉNIX/CUSTOS)"]

    INC --> Audit["IncidentTransition / AuditLog"]
    Audit --> History["Historial / auditoría / analítica"]

    style INC fill:#2e7d32,color:#fff
```

**Lectura**: todas las proyecciones leen del mismo `Incident`; ninguna escribe de vuelta salvo a través de las operaciones formales (`IncidentTransition`, nueva `IncidentEvidence`). Esto es lo que elimina la posibilidad estructural de que dos proyecciones diverjan como ocurre hoy entre `vigiaIncidentToArgusEvent` y `knowledgeIncidentToArgusEvent`.

---

## 5. Migración — vista de fases (resumen visual; detalle en `ARGUS_INCIDENT_MIGRATION_PLAN.md`)

```mermaid
flowchart TB
    subgraph FaseA["Fase A — Contratos y adaptadores"]
        A1["Definir tipos TS: Incident, IncidentEvidence,<br/>IncidentSource, enums de lifecycle/severidad/confianza"]
        A2["Mapeador único canonicalIncidentToArgusEvent()<br/>leyendo temporalmente desde KnowledgeIncident"]
    end

    subgraph FaseB["Fase B — Capa canónica de lectura"]
        B1["Proyección unificada sobre modelos existentes<br/>(KnowledgeIncident + Report/HelpRequest correlacionados en memoria)"]
        B2["Comparación en paralelo contra comportamiento actual<br/>(feature flag, sin afectar producción)"]
    end

    subgraph FaseC["Fase C — Persistencia canónica"]
        C1["Evolucionar KnowledgeIncident → Incident<br/>(columnas de lifecycle/severidad tipadas, canonicalKey)"]
        C2["FK incidentId opcional en Report/HelpRequest"]
        C3["Doble escritura temporal, comparación automática"]
    end

    subgraph FaseD["Fase D — Conectar consumidores"]
        D1["1. Mapa 2D/Orbit 3D"] --> D2["2. Notificaciones"]
        D2 --> D3["3. ATLAS"] --> D4["4. VIGÍA"] --> D5["5. ORÁCULO"] --> D6["6. TALOS"] --> D7["7. Resto (HERMES/ARCA/FÉNIX/CUSTOS)"]
    end

    subgraph FaseE["Fase E — Retiro de legado"]
        E1["src/lib/ingest/* (huérfano)"]
        E2["ExternalEventCorrelation (write-only)"]
        E3["ExternalEvent (tras validar sismos vía Incident)"]
        E4["Dos mapeadores legacy + registros de fuente duplicados"]
    end

    FaseA --> FaseB --> FaseC --> FaseD --> FaseE

    style FaseA fill:#1565c0,color:#fff
    style FaseB fill:#1565c0,color:#fff
    style FaseC fill:#ef6c00,color:#fff
    style FaseD fill:#2e7d32,color:#fff
    style FaseE fill:#6a1b9a,color:#fff
```
