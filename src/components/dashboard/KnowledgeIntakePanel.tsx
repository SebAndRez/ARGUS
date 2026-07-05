"use client";

import { useMemo, useState } from "react";
import IncidentKnowledgeCard from "@/components/dashboard/IncidentKnowledgeCard";
import KnowledgeDomainFilter, { domainFilterMap, type KnowledgeDomainFilterValue } from "@/components/dashboard/KnowledgeDomainFilter";
import KnowledgeInputUploadPanel from "@/components/dashboard/KnowledgeInputUploadPanel";
import KnowledgeSourceRegistryPanel from "@/components/dashboard/KnowledgeSourceRegistryPanel";
import LessonsLearnedPanel from "@/components/dashboard/LessonsLearnedPanel";
import SimilarIncidentsPanel from "@/components/dashboard/SimilarIncidentsPanel";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { getAllKnowledgeSources, getKnowledgeSourceStats } from "@/lib/knowledge-intake/sourceRegistry";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

const domainStats = (() => {
  const counts = new Map<string, number>();
  demoKnowledgeIncidents.forEach((incident) => counts.set(incident.domain, (counts.get(incident.domain) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
})();

export default function KnowledgeIntakePanel() {
  const sources = useMemo(() => getAllKnowledgeSources(), []);
  const stats = useMemo(() => getKnowledgeSourceStats(), []);
  const [filter, setFilter] = useState<KnowledgeDomainFilterValue>("all");
  const [previewIncident, setPreviewIncident] = useState<ArgusIncidentKnowledge | null>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [liveMessage, setLiveMessage] = useState("Sin prueba en vivo ejecutada.");
  const [liveIncidents, setLiveIncidents] = useState<ArgusIncidentKnowledge[]>([]);
  const [nwsQuery, setNwsQuery] = useState("area=US");
  const [openMeteoLat, setOpenMeteoLat] = useState("-33.4489");
  const [openMeteoLon, setOpenMeteoLon] = useState("-70.6693");
  const [openMeteoPurpose, setOpenMeteoPurpose] = useState("general");
  const [openAqLocationId, setOpenAqLocationId] = useState("");
  const [openAqLat, setOpenAqLat] = useState("-33.4489");
  const [openAqLon, setOpenAqLon] = useState("-70.6693");
  const [openAqBbox, setOpenAqBbox] = useState("");
  const [openAqRadiusKm, setOpenAqRadiusKm] = useState("25");
  const [openAqParameters, setOpenAqParameters] = useState("pm25,pm10,o3,no2,so2,co");
  const [openAqPurpose, setOpenAqPurpose] = useState("wildfire_smoke_context");
  const [openAqPersist, setOpenAqPersist] = useState(false);
  const [osmLat, setOsmLat] = useState("-33.4489");
  const [osmLon, setOsmLon] = useState("-70.6693");
  const [osmBbox, setOsmBbox] = useState("");
  const [osmRadiusKm, setOsmRadiusKm] = useState("5");
  const [osmPurpose, setOsmPurpose] = useState("command_center_nearby");
  const [osmCategories, setOsmCategories] = useState("medical_hospital,emergency_fire_station,emergency_police,shelter,fuel");
  const [osmLimit, setOsmLimit] = useState("100");
  const [osmPersist, setOsmPersist] = useState(false);
  const [usgsWaterSite, setUsgsWaterSite] = useState("01646500");
  const [usgsWaterLat, setUsgsWaterLat] = useState("38.9498");
  const [usgsWaterLon, setUsgsWaterLon] = useState("-77.1277");
  const [usgsWaterRadiusKm, setUsgsWaterRadiusKm] = useState("25");
  const [usgsWaterPurpose, setUsgsWaterPurpose] = useState("flood");
  const [usgsWaterParameters, setUsgsWaterParameters] = useState("00060,00065");
  const [coopsStationId, setCoopsStationId] = useState("9414290");
  const [coopsLat, setCoopsLat] = useState("37.8063");
  const [coopsLon, setCoopsLon] = useState("-122.4659");
  const [coopsRadiusKm, setCoopsRadiusKm] = useState("25");
  const [coopsPurpose, setCoopsPurpose] = useState("coastal_monitoring");
  const [coopsProducts, setCoopsProducts] = useState("water_level,predictions,wind,air_pressure");
  const [coopsDatum, setCoopsDatum] = useState("MLLW");
  const [noaaYear, setNoaaYear] = useState("2025");
  const [noaaState, setNoaaState] = useState("TX");
  const [noaaEventTypes, setNoaaEventTypes] = useState("Tornado,Flash Flood");
  const [noaaLimit, setNoaaLimit] = useState("100");
  const [nceiTsunamiStartYear, setNceiTsunamiStartYear] = useState("1900");
  const [nceiTsunamiEndYear, setNceiTsunamiEndYear] = useState("2026");
  const [nceiTsunamiCountry, setNceiTsunamiCountry] = useState("Chile");
  const [nceiTsunamiLimit, setNceiTsunamiLimit] = useState("100");
  const [nceiTsunamiIncludeRunups, setNceiTsunamiIncludeRunups] = useState(true);
  const [openFemaYear, setOpenFemaYear] = useState("2025");
  const [openFemaState, setOpenFemaState] = useState("CA");
  const [openFemaIncidentTypes, setOpenFemaIncidentTypes] = useState("Fire,Flood");
  const [openFemaDisasterNumber, setOpenFemaDisasterNumber] = useState("");
  const [openFemaLimit, setOpenFemaLimit] = useState("100");
  const [hapiLocationCode, setHapiLocationCode] = useState("CHL");
  const [hapiIndicators, setHapiIndicators] = useState("baseline_population,humanitarian_needs,idps,refugees,returnees,operational_presence,food_security");
  const [gdeltTemplateId, setGdeltTemplateId] = useState("gdelt-flood-disaster-media");
  const [gdeltCountry, setGdeltCountry] = useState("Chile");
  const [copernicusBbox, setCopernicusBbox] = useState("-71,-34,-70,-33");
  const [copernicusAoiId, setCopernicusAoiId] = useState("");
  const [jobStatus, setJobStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [jobMessage, setJobMessage] = useState("Sin job persistente ejecutado.");
  const [healthSummary, setHealthSummary] = useState<{
    persistedIncidents?: number;
    persistedDocuments?: number;
    persistedLessons?: number;
    pendingReviews?: number;
    latestIngestionRuns?: Array<{ id: string; sourceId: string; status: string; recordsInserted?: number; recordsUpdated?: number; recordsSkipped?: number }>;
    incidentsByDomain?: Array<{ domain: string; count: number }>;
  } | null>(null);

  const filteredIncidents = useMemo(() => {
    const domains = domainFilterMap[filter];
    return demoKnowledgeIncidents.filter((incident) => {
      if (filter === "chile") return incident.country === "CL";
      if (filter === "global") return true;
      return domains.length === 0 || domains.includes(incident.domain);
    });
  }, [filter]);
  const selectedIncident = previewIncident ?? filteredIncidents[0] ?? demoKnowledgeIncidents[0];
  const realActiveSources = sources.filter((source) => source.status === "active" || source.status === "active_historical" || source.status === "active_institutional");
  const stubSources = sources.filter((source) => source.status === "planned" || source.status === "stub");
  const requiresKeySources = sources.filter((source) => source.status === "requiresApiKey");
  const requiresConfigSources = sources.filter((source) => source.status === "requiresConfiguration");
  async function runLiveTest(source: "usgs" | "gdacs" | "eonet" | "hans" | "nws" | "open-meteo" | "openaq" | "osm-overpass" | "usgs-water" | "noaa-coops" | "noaa" | "ncei-tsunami" | "openfema" | "reliefweb" | "hdx-hapi" | "who-don" | "ecdc" | "gdelt" | "copernicus-glofas" | "copernicus-gfm") {
    setLiveStatus("loading");
    setLiveMessage(`Probando ${source.toUpperCase()}...`);
    try {
      const endpoint =
        source === "usgs"
          ? "/api/knowledge-intake/live/usgs?feed=relevant&limit=8"
          : source === "gdacs"
            ? "/api/knowledge-intake/live/gdacs?eventTypes=EQ;TC;FL;VO;DR;WF&daysBack=7&alertLevels=red;orange;green&limit=8"
            : source === "eonet"
              ? "/api/knowledge-intake/live/eonet?status=open&days=30&limit=8"
              : source === "hans"
                ? "/api/knowledge-intake/live/usgs-volcano-hans?mode=elevated&observatory=all&days=7&includeNotices=true&includeGeoJson=true&limit=8"
                : source === "nws"
                  ? `/api/knowledge-intake/live/nws?mode=alerts&${nwsQuery}&limit=8`
                  : source === "open-meteo"
                    ? `/api/knowledge-intake/live/open-meteo?lat=${encodeURIComponent(openMeteoLat)}&lon=${encodeURIComponent(openMeteoLon)}&forecastDays=3&purpose=${encodeURIComponent(openMeteoPurpose)}`
                    : source === "openaq"
                      ? `/api/knowledge-intake/live/openaq?${openAqLocationId ? `locationId=${encodeURIComponent(openAqLocationId)}` : openAqBbox ? `bbox=${encodeURIComponent(openAqBbox)}` : `lat=${encodeURIComponent(openAqLat)}&lon=${encodeURIComponent(openAqLon)}`}&radiusKm=${encodeURIComponent(openAqRadiusKm)}&parameters=${encodeURIComponent(openAqParameters)}&purpose=${encodeURIComponent(openAqPurpose)}&persist=${openAqPersist}`
                    : source === "osm-overpass"
                      ? `/api/knowledge-intake/live/osm-overpass?${osmBbox ? `bbox=${encodeURIComponent(osmBbox)}` : `lat=${encodeURIComponent(osmLat)}&lon=${encodeURIComponent(osmLon)}`}&radiusKm=${encodeURIComponent(osmRadiusKm)}&purpose=${encodeURIComponent(osmPurpose)}&categories=${encodeURIComponent(osmCategories)}&limit=${encodeURIComponent(osmLimit)}&timeoutSeconds=15&persist=${osmPersist}`
                    : source === "usgs-water"
                      ? `/api/knowledge-intake/live/usgs-water?${usgsWaterSite ? `site=${encodeURIComponent(usgsWaterSite)}` : `lat=${encodeURIComponent(usgsWaterLat)}&lon=${encodeURIComponent(usgsWaterLon)}`}&radiusKm=${encodeURIComponent(usgsWaterRadiusKm)}&purpose=${encodeURIComponent(usgsWaterPurpose)}&parameters=${encodeURIComponent(usgsWaterParameters)}`
                    : source === "noaa-coops"
                      ? `/api/knowledge-intake/live/noaa-coops?${coopsStationId ? `stationId=${encodeURIComponent(coopsStationId)}` : `lat=${encodeURIComponent(coopsLat)}&lon=${encodeURIComponent(coopsLon)}`}&radiusKm=${encodeURIComponent(coopsRadiusKm)}&purpose=${encodeURIComponent(coopsPurpose)}&products=${encodeURIComponent(coopsProducts)}&datum=${encodeURIComponent(coopsDatum)}&units=metric&timeZone=gmt&includeAirGap=${coopsProducts.includes("air_gap")}`
                    : source === "noaa"
                      ? `/api/knowledge-intake/live/noaa-storm-events?mode=preview&year=${encodeURIComponent(noaaYear)}&state=${encodeURIComponent(noaaState)}&eventTypes=${encodeURIComponent(noaaEventTypes)}&limit=${encodeURIComponent(noaaLimit)}`
                    : source === "ncei-tsunami"
                      ? `/api/knowledge-intake/live/noaa-ncei-tsunami?dataset=events-with-runups&startYear=${encodeURIComponent(nceiTsunamiStartYear)}&endYear=${encodeURIComponent(nceiTsunamiEndYear)}&country=${encodeURIComponent(nceiTsunamiCountry)}&includeRunups=${nceiTsunamiIncludeRunups}&limit=${encodeURIComponent(nceiTsunamiLimit)}`
                    : source === "openfema"
                      ? `/api/knowledge-intake/live/openfema?dataset=disaster-declarations&year=${encodeURIComponent(openFemaYear)}&state=${encodeURIComponent(openFemaState)}&incidentTypes=${encodeURIComponent(openFemaIncidentTypes)}&disasterNumber=${encodeURIComponent(openFemaDisasterNumber)}&limit=${encodeURIComponent(openFemaLimit)}`
                    : source === "hdx-hapi"
                      ? `/api/knowledge-intake/live/hdx-hapi?locationCode=${encodeURIComponent(hapiLocationCode)}&indicators=${encodeURIComponent(hapiIndicators)}&purpose=command_center_humanitarian&limit=100`
                    : source === "who-don"
                      ? "/api/knowledge-intake/live/who-don?top=10"
                    : source === "ecdc"
                      ? "/api/knowledge-intake/live/ecdc?feeds=ecdc-cdtr,ecdc-epidemiological-updates,ecdc-risk-assessments&top=10"
                    : source === "gdelt"
                      ? `/api/knowledge-intake/live/gdelt?templateId=${encodeURIComponent(gdeltTemplateId)}&country=${encodeURIComponent(gdeltCountry)}&timespan=24h&maxRecords=25`
                    : source === "copernicus-glofas"
                      ? `/api/knowledge-intake/live/copernicus-glofas?bbox=${encodeURIComponent(copernicusBbox)}&leadTimeDays=7`
                    : source === "copernicus-gfm"
                      ? `/api/knowledge-intake/live/copernicus-gfm?${copernicusAoiId ? `aoiId=${encodeURIComponent(copernicusAoiId)}` : `bbox=${encodeURIComponent(copernicusBbox)}`}&includeGeometry=false`
                    : "/api/knowledge-intake/live/reliefweb?limit=6";
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Fallo ${source}`);
      setLiveIncidents(data.incidents ?? []);
      setLiveStatus("ready");
      if (source === "open-meteo") {
        const flags = Object.entries(data.riskFactors ?? {}).filter(([, active]) => active).map(([key]) => key);
        setLiveMessage(`Open-Meteo entrego contexto ${data.weatherContext?.forecastDays ?? 3}d sin crear incidentes. Riesgos: ${flags.length ? flags.join(", ") : "sin factores elevados"}.`);
      } else if (source === "openaq") {
        const context = data.airQualityObservationContext;
        const latest = context?.latest ?? {};
        setLiveMessage(
          data.status === "requiresConfiguration"
            ? "OpenAQ requiere OPENAQ_API_KEY; fuente en requiresConfiguration, no falla del sistema."
            : `OpenAQ: ${data.locationsFound ?? 0} location(s), ${data.latestFetched ?? 0} medicion(es), PM2.5 ${latest.pm25 ?? "n/a"}, PM10 ${latest.pm10 ?? "n/a"}, staleness ${context?.stalenessMinutes ?? "n/a"} min, evidenceCreated ${data.evidenceCreated ? "si" : "no"}.`
        );
      } else if (source === "osm-overpass") {
        const context = data.criticalInfrastructureContext;
        const nearestHospital = context?.medical?.nearestHospital?.name ?? context?.medical?.nearestHospital?.osmId ?? "n/a";
        const nearestFire = context?.emergency?.nearestFireStation?.name ?? context?.emergency?.nearestFireStation?.osmId ?? "n/a";
        setLiveMessage(`OSM/Overpass: ${data.poisFound ?? 0} POI(s), categorias ${Object.keys(data.countsByCategory ?? {}).length}, hospital ${nearestHospital}, bomberos ${nearestFire}, fromCache ${context?.cache?.fromCache ? "si" : "no"}, evidenceCreated ${data.evidenceCreated ? "si" : "no"}.`);
      } else if (source === "usgs-water") {
        const context = data.hydrologicalContext;
        setLiveMessage(`USGS Water: ${context?.locations?.length ?? 0} estacion(es), ${context?.measurements?.length ?? 0} medicion(es), staleness ${context?.stalenessMinutes ?? "n/a"} min, evidenceCreated ${data.evidenceCreated ? "si" : "no"}.`);
      } else if (source === "noaa-coops") {
        const context = data.coastalObservationContext;
        setLiveMessage(`NOAA CO-OPS: ${context?.stations?.length ?? 0} estacion(es), ${context?.observations?.length ?? 0} lectura(s), datum ${context?.query?.datum ?? "n/a"}, staleness ${context?.stalenessMinutes ?? "n/a"} min, evidenceCreated ${data.evidenceCreated ? "si" : "no"}.`);
      } else if (source === "noaa") {
        setLiveMessage(`NOAA Storm Events preview: ${data.normalized ?? 0} evento(s) historico(s), persistidos ${data.persisted ?? 0}. No es fuente live.`);
      } else if (source === "ncei-tsunami") {
        setLiveMessage(`NOAA NCEI Tsunami preview: ${data.normalizedEvents ?? 0} evento(s), runups ${data.normalizedRunups ?? 0}, evidencia ${data.evidence?.length ?? 0}. No es alerta viva.`);
      } else if (source === "openfema") {
        setLiveMessage(`OpenFEMA preview: ${data.normalized ?? 0} declaracion(es), evidencia ${data.evidence?.length ?? 0}, precedentes ${data.operationalPrecedents?.length ?? 0}. No es sensor live.`);
      } else if (source === "hdx-hapi") {
        setLiveMessage(
          data.status === "requiresConfiguration"
            ? "HDX/OCHA HAPI requiere HAPI_APP_IDENTIFIER; status requiresConfiguration sin romper la app."
            : `HDX/OCHA HAPI: fetched ${data.indicatorsFetched?.length ?? 0} indicador(es), missing ${data.indicatorsMissing?.length ?? 0}, evidenceCreated ${data.evidenceCreated ? "si" : "no"}.`
        );
      } else if (source === "who-don") {
        setLiveMessage(`WHO DON: ${data.normalized ?? 0} DON normalizado(s), incident source controlado, evidenceCreated ${data.evidenceCreated ?? 0}. No diagnostico/no alertas automaticas.`);
      } else if (source === "ecdc") {
        setLiveMessage(`ECDC: ${data.feedsFetched ?? 0} feed(s), ${data.normalized ?? 0} item(s), requiresReview ${data.requiresReview ?? 0}. CDTR como evidencia por defecto.`);
      } else if (source === "gdelt") {
        setLiveMessage(`GDELT: ${data.articlesFetched ?? 0} articulo(s), ${data.uniqueDomains ?? 0} dominio(s), coverageSpike ${data.coverageSpike ? "si" : "no"}. Senal OSINT, no incidente confirmado.`);
      } else if (source === "copernicus-glofas") {
        setLiveMessage(data.status === "requiresConfiguration" ? "GloFAS requiere COPERNICUS_EWDS_API_KEY; status requiresConfiguration." : `GloFAS: contexto forecast preparado, evidenceCreated ${data.evidenceCreated ? "si" : "no"}. No confirma inundacion.`);
      } else if (source === "copernicus-gfm") {
        setLiveMessage(data.status === "requiresConfiguration" ? "GFM requiere COPERNICUS_GFM_ACCESS_TOKEN; status requiresConfiguration." : `GFM: ${data.productsFetched ?? 0} producto(s), evidenceCreated ${data.evidenceCreated ? "si" : "no"}, incidentCreated ${data.incidentCreated ? "si" : "no"}.`);
      } else {
        setLiveMessage(`${data.sourceName ?? data.source ?? source} entrego ${data.count ?? data.normalized ?? 0} incidente(s) normalizado(s).`);
      }
    } catch (error) {
      setLiveStatus("error");
      setLiveMessage(error instanceof Error ? error.message : "No se pudo ejecutar prueba en vivo.");
    }
  }

  async function runPersistentJob(source: "usgs" | "gdacs" | "eonet" | "hans" | "nws" | "open-meteo" | "openaq" | "osm-overpass" | "usgs-water" | "noaa-coops" | "noaa" | "ncei-tsunami" | "openfema" | "hdx-hapi" | "who-don" | "ecdc" | "gdelt" | "copernicus-glofas" | "copernicus-gfm") {
    setJobStatus("loading");
    setJobMessage(`Ejecutando ${source.toUpperCase()} persistente...`);
    try {
      const endpoint =
        source === "usgs"
          ? "/api/knowledge-intake/jobs/run-usgs"
          : source === "gdacs"
            ? "/api/knowledge-intake/jobs/run-gdacs"
            : source === "eonet"
              ? "/api/knowledge-intake/jobs/run-eonet"
              : source === "hans"
                ? "/api/knowledge-intake/jobs/run-usgs-volcano-hans"
                  : source === "nws"
                    ? "/api/knowledge-intake/jobs/run-nws"
                  : source === "openaq"
                    ? "/api/knowledge-intake/jobs/run-openaq-context"
                  : source === "osm-overpass"
                    ? "/api/knowledge-intake/jobs/run-osm-overpass-context"
                  : source === "noaa"
                    ? "/api/knowledge-intake/jobs/import-noaa-storm-events"
                  : source === "noaa-coops"
                    ? "/api/knowledge-intake/jobs/run-noaa-coops-context"
                  : source === "ncei-tsunami"
                    ? "/api/knowledge-intake/jobs/import-noaa-ncei-tsunami"
                  : source === "usgs-water"
                    ? "/api/knowledge-intake/jobs/run-usgs-water-context"
                  : source === "openfema"
                    ? "/api/knowledge-intake/jobs/import-openfema-disaster-declarations"
                  : source === "hdx-hapi"
                    ? "/api/knowledge-intake/jobs/run-hdx-hapi-context"
                  : source === "who-don"
                    ? "/api/knowledge-intake/jobs/run-who-don"
                  : source === "ecdc"
                    ? "/api/knowledge-intake/jobs/run-ecdc"
                  : source === "gdelt"
                    ? "/api/knowledge-intake/jobs/run-gdelt-context"
                  : source === "copernicus-glofas"
                    ? "/api/knowledge-intake/jobs/run-copernicus-glofas-context"
                  : source === "copernicus-gfm"
                    ? "/api/knowledge-intake/jobs/run-copernicus-gfm-context"
                    : "/api/knowledge-intake/jobs/run-open-meteo-context";
      const body = source === "usgs"
        ? { feedType: "relevant", limit: 25 }
        : source === "gdacs"
          ? { eventTypes: ["EQ", "TC", "FL", "VO", "DR", "WF"], daysBack: 7, alertLevels: ["red", "orange", "green"], persist: true, limit: 50 }
          : source === "eonet"
            ? {
              status: "open",
              days: 30,
              categories: ["wildfires", "severeStorms", "volcanoes", "floods", "landslides", "drought", "dustHaze"],
              persist: true,
              limit: 50,
            }
            : {
              mode: "elevated",
              observatory: "all",
              days: 7,
              includeNotices: true,
              includeGeoJson: true,
              persist: true,
              limit: 50,
            };
      const finalBody = source === "nws"
        ? {
          mode: "alerts",
          ...(nwsQuery.startsWith("point=") ? { point: nwsQuery.replace(/^point=/, "") } : {}),
          ...(nwsQuery.startsWith("area=") ? { area: nwsQuery.replace(/^area=/, "") } : {}),
          persist: true,
          limit: 50,
        }
        : source === "open-meteo"
          ? {
            purpose: "incident_context",
            forecastDays: 3,
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
          }
        : source === "openaq"
          ? {
            purpose: openAqPurpose,
            radiusKm: Number(openAqRadiusKm) || 25,
            parameters: openAqParameters.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
          }
        : source === "osm-overpass"
          ? {
            purpose: osmPurpose,
            radiusKm: Number(osmRadiusKm) || 5,
            categories: osmCategories.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            limit: Number(osmLimit) || 100,
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
            cacheTtlMinutes: 360,
          }
        : source === "usgs-water"
          ? {
            purpose: usgsWaterPurpose,
            radiusKm: Number(usgsWaterRadiusKm) || 25,
            parameters: usgsWaterParameters.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
          }
        : source === "noaa"
          ? {
            year: Number(noaaYear),
            state: noaaState || undefined,
            eventTypes: noaaEventTypes.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            limit: Number(noaaLimit) || 1000,
            persist: true,
          }
        : source === "noaa-coops"
          ? {
            purpose: coopsPurpose,
            radiusKm: Number(coopsRadiusKm) || 25,
            products: coopsProducts.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            datum: coopsDatum || "MLLW",
            units: "metric",
            timeZone: "gmt",
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
            includeAirGap: coopsProducts.includes("air_gap"),
          }
        : source === "openfema"
          ? {
            year: Number(openFemaYear) || undefined,
            state: openFemaState || undefined,
            incidentTypes: openFemaIncidentTypes.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            disasterNumber: openFemaDisasterNumber || undefined,
            limit: Number(openFemaLimit) || 1000,
            persist: true,
          }
        : source === "ncei-tsunami"
          ? {
            dataset: "events-with-runups",
            startYear: Number(nceiTsunamiStartYear) || undefined,
            endYear: Number(nceiTsunamiEndYear) || undefined,
            country: nceiTsunamiCountry || undefined,
            includeRunups: nceiTsunamiIncludeRunups,
            maxRunupsPerEvent: 50,
            limit: Number(nceiTsunamiLimit) || 100,
            persist: true,
          }
        : source === "hdx-hapi"
          ? {
            locationCode: hapiLocationCode,
            indicators: hapiIndicators.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            purpose: "command_center_humanitarian",
            persist: true,
            limit: 100,
          }
        : source === "who-don"
          ? {
            top: 20,
            sinceDays: 30,
            persist: true,
            createIncidents: true,
            updateExisting: true,
          }
        : source === "ecdc"
          ? {
            feeds: ["ecdc-cdtr", "ecdc-epidemiological-updates", "ecdc-risk-assessments"],
            top: 20,
            sinceDays: 30,
            persist: true,
            createIncidents: true,
            updateExisting: true,
          }
        : source === "gdelt"
          ? {
            templates: [gdeltTemplateId],
            country: gdeltCountry,
            timespan: "24h",
            maxRecords: 25,
            persist: true,
            createCandidate: false,
          }
        : source === "copernicus-glofas"
          ? {
            bbox: copernicusBbox,
            leadTimeDays: 7,
            persist: true,
          }
        : source === "copernicus-gfm"
          ? {
            aoiId: copernicusAoiId || undefined,
            bbox: copernicusAoiId ? undefined : copernicusBbox,
            persist: true,
            createIncident: false,
          }
        : body;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalBody),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `${source.toUpperCase()} persistent job failed`);
      setJobStatus("ready");
      setJobMessage(
        source === "open-meteo"
          ? `Run ${data.runId}: ${data.evidenceCreated ?? 0} contextos creados, ${data.skippedAlreadyFresh ?? 0} frescos, ${data.skippedMissingCoordinates ?? 0} sin coordenadas.`
          : source === "openaq"
            ? data.status === "requiresConfiguration"
              ? "OpenAQ requiere OPENAQ_API_KEY; job omitido sin romper otras fuentes."
              : `Run ${data.runId}: ${data.evidenceCreated ?? 0} contextos OpenAQ, ${data.skippedAlreadyFresh ?? 0} frescos, ${data.skippedNoNearbyLocation ?? 0} sin location cercana.`
          : source === "osm-overpass"
            ? `Run ${data.runId}: ${data.evidenceCreated ?? 0} contextos OSM, ${data.skippedAlreadyFresh ?? 0} frescos, ${data.skippedOverpassTimeout ?? 0} timeout/rate-limit, ${data.skippedMissingCoordinates ?? 0} sin coordenadas.`
          : source === "usgs-water"
            ? `Run ${data.runId}: ${data.evidenceCreated ?? 0} contextos hidrologicos, ${data.skippedAlreadyFresh ?? 0} frescos, ${data.skippedNoNearbyStation ?? 0} sin estacion cercana.`
          : source === "noaa"
            ? `Run ${data.runId}: ${data.inserted ?? 0} NOAA historicos nuevos, ${data.updated ?? 0} actualizados, evidencia ${data.evidenceCreated ?? 0}.`
          : source === "ncei-tsunami"
            ? `Run ${data.runId}: ${data.insertedIncidents ?? 0} tsunamis historicos nuevos, ${data.updatedIncidents ?? 0} actualizados, runups ${data.associatedRunups ?? 0}, evidencia ${data.evidenceCreated ?? 0}.`
          : source === "openfema"
            ? `Run ${data.runId}: ${data.inserted ?? 0} OpenFEMA nuevos, ${data.updated ?? 0} actualizados, evidencia ${data.evidenceCreated ?? 0}, precedentes ${data.operationalPrecedentsCreated ?? 0}.`
          : source === "hdx-hapi"
            ? data.status === "requiresConfiguration"
              ? "HDX/OCHA HAPI requiere HAPI_APP_IDENTIFIER; job omitido sin romper otras fuentes."
              : `Run ${data.runId}: ${data.evidenceCreated ?? 0} evidencia humanitarian_context, indicadores ${data.indicatorsFetched?.length ?? 0}.`
          : source === "who-don"
            ? `Run ${data.runId}: WHO DON incidents ${data.incidentsCreated ?? 0}/${data.incidentsUpdated ?? 0}, evidencia ${data.evidenceCreated ?? 0}, review ${data.requiresReview ?? 0}.`
          : source === "ecdc"
            ? `Run ${data.runId}: ECDC items ${data.normalized ?? 0}, evidencia ${data.evidenceCreated ?? 0}, incidents ${data.incidentsCreated ?? 0}/${data.incidentsUpdated ?? 0}, CDTR evidence ${data.cdtrReportsAsEvidence ?? 0}.`
          : source === "gdelt"
            ? `Run ${data.runId}: GDELT evidencia ${data.evidenceCreated ?? 0}, templates ${data.templatesRun?.length ?? 0}, spikes ${data.coverageSpikesFound ?? 0}. No crea incidentes confirmados.`
          : source === "copernicus-glofas"
            ? data.status === "requiresConfiguration"
              ? "GloFAS requiere COPERNICUS_EWDS_API_KEY; job omitido sin romper otras fuentes."
              : `Run ${data.runId}: GloFAS evidence ${data.evidenceCreated ?? 0}; forecast/model context.`
          : source === "copernicus-gfm"
            ? data.status === "requiresConfiguration"
              ? "GFM requiere COPERNICUS_GFM_ACCESS_TOKEN; job omitido sin romper otras fuentes."
              : `Run ${data.runId}: GFM products ${data.productsFetched ?? 0}, evidence ${data.evidenceCreated ?? 0}, incidents ${data.incidentCreated ?? 0}/${data.incidentUpdated ?? 0}.`
          : `Run ${data.runId}: ${data.inserted ?? 0} nuevos, ${data.updated ?? 0} actualizados, ${data.skipped ?? 0} omitidos.`
      );
      await refreshPersistentHealth();
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : `No se pudo ejecutar ${source.toUpperCase()} persistente.`);
    }
  }

  async function refreshPersistentHealth() {
    const response = await fetch("/api/knowledge-intake/health", { cache: "no-store" });
    const data = await response.json();
    setHealthSummary(data.persistentMemory ?? null);
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-cyan-300/20 bg-slate-950/80 p-5 shadow-2xl shadow-black/35">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200">ARGUS Knowledge Intake Engine</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Motor de aprendizaje operacional</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
              Absorbe fuentes abiertas, informes tecnicos, datasets y reportes para normalizar incidentes,
              medir confiabilidad, extraer lecciones y alimentar mapa, prediccion, rutas, Fenix Twin y AURA Medic Mesh.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Metric label="Fuentes" value={stats.total} />
            <Metric label="Activas" value={stats.active} />
            <Metric label="Planificadas" value={stats.planned} />
            <Metric label="Incidentes" value={demoKnowledgeIncidents.length} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-emerald-200">Activas reales</p>
            <p className="mt-1 text-2xl font-semibold text-white">{realActiveSources.length}</p>
            <p className="mt-1 text-xs text-slate-400">USGS, GDACS, NASA EONET y USGS Volcano HANS activos; ReliefWeb/FIRMS quedan en stand by por configuracion.</p>
          </div>
          <div>
            <p className="text-xs uppercase text-amber-200">Stub/planificadas</p>
            <p className="mt-1 text-2xl font-semibold text-white">{stubSources.length}</p>
            <p className="mt-1 text-xs text-slate-400">Registradas sin ingesta automatica real.</p>
          </div>
          <div>
            <p className="text-xs uppercase text-rose-200">Requieren config/key</p>
            <p className="mt-1 text-2xl font-semibold text-white">{requiresKeySources.length + requiresConfigSources.length}</p>
            <p className="mt-1 text-xs text-slate-400">
              {[...requiresKeySources, ...requiresConfigSources].map((source) => source.name).join(", ") || "Ninguna"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-cyan-300/15 bg-cyan-400/10 p-4">
          <button
            type="button"
            onClick={() => runLiveTest("usgs")}
            disabled={liveStatus === "loading"}
            className="rounded bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Probar USGS
          </button>
          <button
            type="button"
            onClick={() => runLiveTest("gdacs")}
            disabled={liveStatus === "loading"}
            className="rounded bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test GDACS
          </button>
          <button
            type="button"
            onClick={() => runLiveTest("eonet")}
            disabled={liveStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test EONET
          </button>
          <button
            type="button"
            onClick={() => runLiveTest("hans")}
            disabled={liveStatus === "loading"}
            className="rounded bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test USGS Volcano HANS
          </button>
          <input
            value={nwsQuery}
            onChange={(event) => setNwsQuery(event.target.value)}
            className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="NWS query"
          />
          <button
            type="button"
            onClick={() => runLiveTest("nws")}
            disabled={liveStatus === "loading"}
            className="rounded bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test NWS
          </button>
          <input
            value={openMeteoLat}
            onChange={(event) => setOpenMeteoLat(event.target.value)}
            className="min-h-10 w-28 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="Open-Meteo latitude"
          />
          <input
            value={openMeteoLon}
            onChange={(event) => setOpenMeteoLon(event.target.value)}
            className="min-h-10 w-28 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="Open-Meteo longitude"
          />
          <select
            value={openMeteoPurpose}
            onChange={(event) => setOpenMeteoPurpose(event.target.value)}
            className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="Open-Meteo purpose"
          >
            {["general", "wildfire", "flood", "nav", "aura", "fenix", "incident_context", "citizen_report_context"].map((purpose) => (
              <option key={purpose} value={purpose}>{purpose}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => runLiveTest("open-meteo")}
            disabled={liveStatus === "loading"}
            className="rounded bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test Open-Meteo
          </button>
          <div className="grid w-full gap-2 rounded border border-emerald-300/20 bg-emerald-400/10 p-3 lg:grid-cols-[110px_100px_100px_minmax(160px,1fr)_90px_190px_170px_auto_auto]">
            <input
              value={openAqLocationId}
              onChange={(event) => setOpenAqLocationId(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ locationId"
              placeholder="locationId"
            />
            <input
              value={openAqLat}
              onChange={(event) => setOpenAqLat(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ latitude"
              placeholder="lat"
            />
            <input
              value={openAqLon}
              onChange={(event) => setOpenAqLon(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ longitude"
              placeholder="lon"
            />
            <input
              value={openAqBbox}
              onChange={(event) => setOpenAqBbox(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ bbox"
              placeholder="bbox minLon,minLat,maxLon,maxLat"
            />
            <input
              value={openAqRadiusKm}
              onChange={(event) => setOpenAqRadiusKm(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ radius"
            />
            <input
              value={openAqParameters}
              onChange={(event) => setOpenAqParameters(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ parameters"
            />
            <select
              value={openAqPurpose}
              onChange={(event) => setOpenAqPurpose(event.target.value)}
              className="min-h-10 rounded border border-emerald-300/20 bg-slate-950 px-3 text-sm text-emerald-100 outline-none"
              aria-label="OpenAQ purpose"
            >
              {["wildfire_smoke_context", "volcanic_ash_context", "dust_haze_context", "urban_pollution_context", "aura", "nav", "fenix", "incident_context", "air_quality_monitoring", "general"].map((purpose) => (
                <option key={purpose} value={purpose}>{purpose}</option>
              ))}
            </select>
            <label className="flex min-h-10 items-center gap-2 rounded border border-emerald-300/20 bg-slate-950 px-3 text-xs font-semibold text-emerald-100">
              <input
                type="checkbox"
                checked={openAqPersist}
                onChange={(event) => setOpenAqPersist(event.target.checked)}
              />
              Persist
            </label>
            <button
              type="button"
              onClick={() => runLiveTest("openaq")}
              disabled={liveStatus === "loading"}
              className="rounded bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test OpenAQ
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-emerald-100 lg:col-span-9">
              <span className="rounded border border-emerald-200/20 px-2 py-1">Air Quality Context</span>
              <span className="rounded border border-emerald-200/20 px-2 py-1">Requires API key</span>
              <span className="rounded border border-emerald-200/20 px-2 py-1">Provider-dependent</span>
              <span className="rounded border border-emerald-200/20 px-2 py-1">License metadata required</span>
              <span className="rounded border border-emerald-200/20 px-2 py-1">Not incident source</span>
              <span className="rounded border border-emerald-200/20 px-2 py-1">No medical diagnosis</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-lime-300/20 bg-lime-400/10 p-3 lg:grid-cols-[100px_100px_minmax(160px,1fr)_80px_190px_minmax(190px,1fr)_80px_auto_auto]">
            <input
              value={osmLat}
              onChange={(event) => setOsmLat(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM latitude"
              placeholder="lat"
            />
            <input
              value={osmLon}
              onChange={(event) => setOsmLon(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM longitude"
              placeholder="lon"
            />
            <input
              value={osmBbox}
              onChange={(event) => setOsmBbox(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM bbox"
              placeholder="bbox west,south,east,north"
            />
            <input
              value={osmRadiusKm}
              onChange={(event) => setOsmRadiusKm(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM radius"
            />
            <select
              value={osmPurpose}
              onChange={(event) => setOsmPurpose(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM purpose"
            >
              {["command_center_nearby", "aura_medical", "fenix_shelter", "fenix_exposure", "nav_route_context", "emergency_services", "logistics", "incident_context", "map_viewport", "general"].map((purpose) => (
                <option key={purpose} value={purpose}>{purpose}</option>
              ))}
            </select>
            <input
              value={osmCategories}
              onChange={(event) => setOsmCategories(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM categories"
            />
            <input
              value={osmLimit}
              onChange={(event) => setOsmLimit(event.target.value)}
              className="min-h-10 rounded border border-lime-300/20 bg-slate-950 px-3 text-sm text-lime-100 outline-none"
              aria-label="OSM limit"
            />
            <label className="flex min-h-10 items-center gap-2 rounded border border-lime-300/20 bg-slate-950 px-3 text-xs font-semibold text-lime-100">
              <input
                type="checkbox"
                checked={osmPersist}
                onChange={(event) => setOsmPersist(event.target.checked)}
              />
              Persist
            </label>
            <button
              type="button"
              onClick={() => runLiveTest("osm-overpass")}
              disabled={liveStatus === "loading"}
              className="rounded bg-lime-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test OSM/Overpass
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-lime-100 lg:col-span-9">
              <span className="rounded border border-lime-200/20 px-2 py-1">Critical Infrastructure Context</span>
              <span className="rounded border border-lime-200/20 px-2 py-1">OpenStreetMap</span>
              <span className="rounded border border-lime-200/20 px-2 py-1">No API key</span>
              <span className="rounded border border-lime-200/20 px-2 py-1">ODbL attribution required</span>
              <span className="rounded border border-lime-200/20 px-2 py-1">Not incident source</span>
              <span className="rounded border border-lime-200/20 px-2 py-1">Not official registry</span>
              <span className="rounded border border-lime-200/20 px-2 py-1">Cache required</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-cyan-300/20 bg-cyan-400/10 p-3 lg:grid-cols-[110px_100px_100px_90px_120px_120px_auto_auto]">
            <input
              value={usgsWaterSite}
              onChange={(event) => setUsgsWaterSite(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water site"
              placeholder="site"
            />
            <input
              value={usgsWaterLat}
              onChange={(event) => setUsgsWaterLat(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water latitude"
              placeholder="lat"
            />
            <input
              value={usgsWaterLon}
              onChange={(event) => setUsgsWaterLon(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water longitude"
              placeholder="lon"
            />
            <input
              value={usgsWaterRadiusKm}
              onChange={(event) => setUsgsWaterRadiusKm(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water radius"
            />
            <select
              value={usgsWaterPurpose}
              onChange={(event) => setUsgsWaterPurpose(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water purpose"
            >
              {["flood", "nav", "fenix", "aura", "incident_context", "drought", "general"].map((purpose) => (
                <option key={purpose} value={purpose}>{purpose}</option>
              ))}
            </select>
            <input
              value={usgsWaterParameters}
              onChange={(event) => setUsgsWaterParameters(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water parameters"
            />
            <button
              type="button"
              onClick={() => runLiveTest("usgs-water")}
              disabled={liveStatus === "loading"}
              className="rounded bg-cyan-200 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test USGS Water
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-cyan-100">
              <span className="rounded border border-cyan-200/20 px-2 py-1">Hydrological Context</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Official USGS</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Not incident source</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Optional API key</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Modern API preferred</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-sky-300/20 bg-sky-400/10 p-3 lg:grid-cols-[110px_100px_100px_90px_150px_190px_90px_auto]">
            <input
              value={coopsStationId}
              onChange={(event) => setCoopsStationId(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS station"
              placeholder="stationId"
            />
            <input
              value={coopsLat}
              onChange={(event) => setCoopsLat(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS latitude"
              placeholder="lat"
            />
            <input
              value={coopsLon}
              onChange={(event) => setCoopsLon(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS longitude"
              placeholder="lon"
            />
            <input
              value={coopsRadiusKm}
              onChange={(event) => setCoopsRadiusKm(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS radius"
            />
            <select
              value={coopsPurpose}
              onChange={(event) => setCoopsPurpose(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS purpose"
            >
              {["tsunami_context", "hurricane_context", "storm_surge_context", "nav", "fenix", "aura", "incident_context", "coastal_monitoring", "general"].map((purpose) => (
                <option key={purpose} value={purpose}>{purpose}</option>
              ))}
            </select>
            <input
              value={coopsProducts}
              onChange={(event) => setCoopsProducts(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS products"
            />
            <input
              value={coopsDatum}
              onChange={(event) => setCoopsDatum(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="NOAA CO-OPS datum"
            />
            <button
              type="button"
              onClick={() => runLiveTest("noaa-coops")}
              disabled={liveStatus === "loading"}
              className="rounded bg-sky-200 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test NOAA CO-OPS
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-sky-100 lg:col-span-8">
              <span className="rounded border border-sky-200/20 px-2 py-1">Coastal Observation Context</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Official NOAA</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Not incident source</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">No API key</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Datum required</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Observed vs Predicted</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-indigo-300/20 bg-indigo-400/10 p-3 lg:grid-cols-[90px_90px_minmax(180px,1fr)_90px_auto_auto]">
            <input
              value={noaaYear}
              onChange={(event) => setNoaaYear(event.target.value)}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events year"
            />
            <input
              value={noaaState}
              onChange={(event) => setNoaaState(event.target.value.toUpperCase())}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events state"
            />
            <input
              value={noaaEventTypes}
              onChange={(event) => setNoaaEventTypes(event.target.value)}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events event types"
            />
            <input
              value={noaaLimit}
              onChange={(event) => setNoaaLimit(event.target.value)}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events limit"
            />
            <button
              type="button"
              onClick={() => runLiveTest("noaa")}
              disabled={liveStatus === "loading"}
              className="rounded bg-indigo-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Preview NOAA Storm Events
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-indigo-100">
              <span className="rounded border border-indigo-200/20 px-2 py-1">Historical dataset</span>
              <span className="rounded border border-indigo-200/20 px-2 py-1">Not live</span>
              <span className="rounded border border-indigo-200/20 px-2 py-1">Controlled import</span>
              <span className="rounded border border-amber-200/30 px-2 py-1 text-amber-100">Data quality caution</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-cyan-300/20 bg-cyan-400/10 p-3 lg:grid-cols-[90px_90px_minmax(140px,1fr)_90px_auto_auto]">
            <input
              value={nceiTsunamiStartYear}
              onChange={(event) => setNceiTsunamiStartYear(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="NOAA NCEI tsunami start year"
              placeholder="start"
            />
            <input
              value={nceiTsunamiEndYear}
              onChange={(event) => setNceiTsunamiEndYear(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="NOAA NCEI tsunami end year"
              placeholder="end"
            />
            <input
              value={nceiTsunamiCountry}
              onChange={(event) => setNceiTsunamiCountry(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="NOAA NCEI tsunami country"
              placeholder="country"
            />
            <input
              value={nceiTsunamiLimit}
              onChange={(event) => setNceiTsunamiLimit(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="NOAA NCEI tsunami limit"
            />
            <label className="flex min-h-10 items-center gap-2 rounded border border-cyan-300/20 bg-slate-950 px-3 text-xs font-semibold text-cyan-100">
              <input
                type="checkbox"
                checked={nceiTsunamiIncludeRunups}
                onChange={(event) => setNceiTsunamiIncludeRunups(event.target.checked)}
              />
              Runups
            </label>
            <button
              type="button"
              onClick={() => runLiveTest("ncei-tsunami")}
              disabled={liveStatus === "loading"}
              className="rounded bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Preview historical tsunamis
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-cyan-100 lg:col-span-6">
              <span className="rounded border border-cyan-200/20 px-2 py-1">Historical Tsunami Dataset</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Global historical</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Events + Runups</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Not live</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Citation required</span>
              <span className="rounded border border-amber-200/30 px-2 py-1 text-amber-100">Data quality caution</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-sky-300/20 bg-sky-400/10 p-3 lg:grid-cols-[90px_90px_minmax(160px,1fr)_130px_90px_auto_auto]">
            <input
              value={openFemaYear}
              onChange={(event) => setOpenFemaYear(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA year"
            />
            <input
              value={openFemaState}
              onChange={(event) => setOpenFemaState(event.target.value.toUpperCase())}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA state"
            />
            <input
              value={openFemaIncidentTypes}
              onChange={(event) => setOpenFemaIncidentTypes(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA incident types"
            />
            <input
              value={openFemaDisasterNumber}
              onChange={(event) => setOpenFemaDisasterNumber(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA disaster number"
              placeholder="disaster #"
            />
            <input
              value={openFemaLimit}
              onChange={(event) => setOpenFemaLimit(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA limit"
            />
            <button
              type="button"
              onClick={() => runLiveTest("openfema")}
              disabled={liveStatus === "loading"}
              className="rounded bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Preview OpenFEMA
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-sky-100">
              <span className="rounded border border-sky-200/20 px-2 py-1">Institutional dataset</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Not live sensor</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Disaster declarations</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Controlled import</span>
              <span className="rounded border border-emerald-200/30 px-2 py-1 text-emerald-100">ARGUS learns from FEMA precedents</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => runLiveTest("reliefweb")}
            disabled={liveStatus === "loading"}
            className="rounded border border-cyan-300/30 bg-slate-950 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-wait disabled:opacity-60"
          >
            Probar ReliefWeb
          </button>
          <div className="grid w-full gap-2 rounded border border-teal-300/20 bg-teal-400/10 p-3 lg:grid-cols-[90px_minmax(260px,1fr)_auto_auto]">
            <input
              value={hapiLocationCode}
              onChange={(event) => setHapiLocationCode(event.target.value.toUpperCase())}
              className="min-h-10 rounded border border-teal-300/20 bg-slate-950 px-3 text-sm text-teal-100 outline-none"
              aria-label="HAPI location code"
              placeholder="ISO3"
            />
            <input
              value={hapiIndicators}
              onChange={(event) => setHapiIndicators(event.target.value)}
              className="min-h-10 rounded border border-teal-300/20 bg-slate-950 px-3 text-sm text-teal-100 outline-none"
              aria-label="HAPI indicators"
            />
            <button
              type="button"
              onClick={() => runLiveTest("hdx-hapi")}
              disabled={liveStatus === "loading"}
              className="rounded bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test HDX HAPI
            </button>
            <button
              type="button"
              onClick={() => runPersistentJob("hdx-hapi")}
              disabled={jobStatus === "loading"}
              className="rounded border border-teal-200/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-teal-100 disabled:cursor-wait disabled:opacity-60"
            >
              Run HAPI context
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-teal-100 lg:col-span-4">
              <span className="rounded border border-teal-200/20 px-2 py-1">Humanitarian Context</span>
              <span className="rounded border border-teal-200/20 px-2 py-1">Requires app identifier</span>
              <span className="rounded border border-teal-200/20 px-2 py-1">Dataset-dependent</span>
              <span className="rounded border border-teal-200/20 px-2 py-1">Not incident source</span>
              <span className="rounded border border-teal-200/20 px-2 py-1">Reference period required</span>
              <span className="rounded border border-teal-200/20 px-2 py-1">No sector summation</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-rose-300/20 bg-rose-400/10 p-3 lg:grid-cols-[auto_auto_auto_auto]">
            <button
              type="button"
              onClick={() => runLiveTest("who-don")}
              disabled={liveStatus === "loading"}
              className="rounded bg-rose-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test WHO DON
            </button>
            <button
              type="button"
              onClick={() => runPersistentJob("who-don")}
              disabled={jobStatus === "loading"}
              className="rounded border border-rose-200/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-rose-100 disabled:cursor-wait disabled:opacity-60"
            >
              Run WHO DON ingest
            </button>
            <button
              type="button"
              onClick={() => runLiveTest("ecdc")}
              disabled={liveStatus === "loading"}
              className="rounded bg-orange-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test ECDC RSS
            </button>
            <button
              type="button"
              onClick={() => runPersistentJob("ecdc")}
              disabled={jobStatus === "loading"}
              className="rounded border border-orange-200/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-orange-100 disabled:cursor-wait disabled:opacity-60"
            >
              Run ECDC ingest
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-rose-100 lg:col-span-4">
              <span className="rounded border border-rose-200/20 px-2 py-1">Official WHO</span>
              <span className="rounded border border-rose-200/20 px-2 py-1">Official ECDC</span>
              <span className="rounded border border-rose-200/20 px-2 py-1">Public Health Outbreak Source</span>
              <span className="rounded border border-rose-200/20 px-2 py-1">CDTR evidence by default</span>
              <span className="rounded border border-rose-200/20 px-2 py-1">No diagnosis</span>
              <span className="rounded border border-rose-200/20 px-2 py-1">No automatic citizen alerts</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-fuchsia-300/20 bg-fuchsia-400/10 p-3 lg:grid-cols-[minmax(220px,1fr)_120px_auto_auto]">
            <select
              value={gdeltTemplateId}
              onChange={(event) => setGdeltTemplateId(event.target.value)}
              className="min-h-10 rounded border border-fuchsia-300/20 bg-slate-950 px-3 text-sm text-fuchsia-100 outline-none"
              aria-label="GDELT template"
            >
              {["gdelt-earthquake-tsunami-media", "gdelt-wildfire-smoke-media", "gdelt-flood-disaster-media", "gdelt-protest-unrest-media", "gdelt-explosion-attack-media", "gdelt-public-health-outbreak-media", "gdelt-infrastructure-collapse-media", "gdelt-humanitarian-crisis-media"].map((template) => (
                <option key={template} value={template}>{template}</option>
              ))}
            </select>
            <input
              value={gdeltCountry}
              onChange={(event) => setGdeltCountry(event.target.value)}
              className="min-h-10 rounded border border-fuchsia-300/20 bg-slate-950 px-3 text-sm text-fuchsia-100 outline-none"
              aria-label="GDELT country"
              placeholder="country"
            />
            <button
              type="button"
              onClick={() => runLiveTest("gdelt")}
              disabled={liveStatus === "loading"}
              className="rounded bg-fuchsia-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test GDELT media signal
            </button>
            <button
              type="button"
              onClick={() => runPersistentJob("gdelt")}
              disabled={jobStatus === "loading"}
              className="rounded border border-fuchsia-200/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-fuchsia-100 disabled:cursor-wait disabled:opacity-60"
            >
              Run GDELT context
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-fuchsia-100 lg:col-span-4">
              <span className="rounded border border-fuchsia-200/20 px-2 py-1">OSINT Media Signal</span>
              <span className="rounded border border-fuchsia-200/20 px-2 py-1">Not official</span>
              <span className="rounded border border-fuchsia-200/20 px-2 py-1">No API key</span>
              <span className="rounded border border-fuchsia-200/20 px-2 py-1">No automatic incident confirmation</span>
              <span className="rounded border border-fuchsia-200/20 px-2 py-1">Requires review</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-blue-300/20 bg-blue-400/10 p-3 lg:grid-cols-[minmax(180px,1fr)_140px_auto_auto_auto_auto]">
            <input
              value={copernicusBbox}
              onChange={(event) => setCopernicusBbox(event.target.value)}
              className="min-h-10 rounded border border-blue-300/20 bg-slate-950 px-3 text-sm text-blue-100 outline-none"
              aria-label="Copernicus bbox"
              placeholder="bbox"
            />
            <input
              value={copernicusAoiId}
              onChange={(event) => setCopernicusAoiId(event.target.value)}
              className="min-h-10 rounded border border-blue-300/20 bg-slate-950 px-3 text-sm text-blue-100 outline-none"
              aria-label="Copernicus AOI"
              placeholder="GFM AOI"
            />
            <button
              type="button"
              onClick={() => runLiveTest("copernicus-glofas")}
              disabled={liveStatus === "loading"}
              className="rounded bg-blue-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test GloFAS
            </button>
            <button
              type="button"
              onClick={() => runPersistentJob("copernicus-glofas")}
              disabled={jobStatus === "loading"}
              className="rounded border border-blue-200/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-blue-100 disabled:cursor-wait disabled:opacity-60"
            >
              Run GloFAS
            </button>
            <button
              type="button"
              onClick={() => runLiveTest("copernicus-gfm")}
              disabled={liveStatus === "loading"}
              className="rounded bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test GFM
            </button>
            <button
              type="button"
              onClick={() => runPersistentJob("copernicus-gfm")}
              disabled={jobStatus === "loading"}
              className="rounded border border-sky-200/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-sky-100 disabled:cursor-wait disabled:opacity-60"
            >
              Run GFM
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-blue-100 lg:col-span-6">
              <span className="rounded border border-blue-200/20 px-2 py-1">Flood Forecast</span>
              <span className="rounded border border-blue-200/20 px-2 py-1">Satellite Flood Observation</span>
              <span className="rounded border border-blue-200/20 px-2 py-1">Requires tokens</span>
              <span className="rounded border border-blue-200/20 px-2 py-1">No global bulk</span>
              <span className="rounded border border-blue-200/20 px-2 py-1">No evacuation orders</span>
              <span className="rounded border border-blue-200/20 px-2 py-1">No official route closures</span>
            </div>
          </div>
          <span className={`text-sm ${liveStatus === "error" ? "text-rose-100" : liveStatus === "ready" ? "text-emerald-100" : "text-slate-300"}`}>
            {liveMessage}
          </span>
        </div>
        <div className="mt-4 grid gap-3 rounded-lg border border-emerald-300/15 bg-emerald-400/10 p-4 lg:grid-cols-[auto_auto_minmax(0,1fr)]">
          <button
            type="button"
            onClick={() => runPersistentJob("usgs")}
            disabled={jobStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("gdacs")}
            disabled={jobStatus === "loading"}
            className="rounded bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run GDACS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("eonet")}
            disabled={jobStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run EONET ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("hans")}
            disabled={jobStatus === "loading"}
            className="rounded bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS Volcano HANS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("nws")}
            disabled={jobStatus === "loading"}
            className="rounded bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run NWS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("open-meteo")}
            disabled={jobStatus === "loading"}
            className="rounded bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run Open-Meteo context enrichment
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("openaq")}
            disabled={jobStatus === "loading"}
            className="rounded bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run OpenAQ context
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("osm-overpass")}
            disabled={jobStatus === "loading"}
            className="rounded bg-lime-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run OSM context
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("usgs-water")}
            disabled={jobStatus === "loading"}
            className="rounded bg-cyan-200 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS Water context
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("noaa-coops")}
            disabled={jobStatus === "loading"}
            className="rounded bg-sky-200 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run CO-OPS context
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("noaa")}
            disabled={jobStatus === "loading"}
            className="rounded bg-indigo-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Import NOAA Storm Events
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("ncei-tsunami")}
            disabled={jobStatus === "loading"}
            className="rounded bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Import historical tsunamis
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("openfema")}
            disabled={jobStatus === "loading"}
            className="rounded bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Import OpenFEMA declarations
          </button>
          <button
            type="button"
            onClick={refreshPersistentHealth}
            className="rounded border border-emerald-300/30 bg-slate-950 px-4 py-2 text-sm font-semibold text-emerald-100"
          >
            Actualizar memoria
          </button>
          <span className={`text-sm ${jobStatus === "error" ? "text-rose-100" : jobStatus === "ready" ? "text-emerald-100" : "text-slate-300"}`}>
            {jobMessage}
          </span>
        </div>
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
          USGS monitored volcanoes; global architecture supports additional regional volcano sources. HANS conserva alertLevel terrestre y aviationColorCode como senales separadas, sin ordenes automaticas.
        </div>
        <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
          NWS Weather Alerts: United States and NWS territories; global architecture supports additional weather sources.
        </div>
        <div className="mt-3 rounded-lg border border-teal-300/20 bg-teal-300/10 p-3 text-xs leading-5 text-teal-100">
          Open-Meteo Weather Context: contextual source, global coverage, no API key. Commercial use requires review. It does not create incidents or official alerts.
        </div>
        <div className="mt-3 rounded-lg border border-lime-300/20 bg-lime-300/10 p-3 text-xs leading-5 text-lime-100">
          OpenStreetMap / Overpass Critical Infrastructure: collaborative mapped POIs by bounded radius or bbox only. © OpenStreetMap contributors, ODbL. Not an official registry, routing engine, geocoder, public tile backend, availability source or incident source.
        </div>
        <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
          USGS Water Conditions: official USGS hydrological context for United States and USGS monitored locations. Parameters 00060 streamflow and 00065 gage height; not a forecast, incident source, evacuation order or route closure.
        </div>
        <div className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 p-3 text-xs leading-5 text-sky-100">
          NOAA CO-OPS Coastal Observations: official NOAA coastal station context for water level, tide predictions, wind, air pressure and optional air gap. Datum and staleness are mandatory; observed and predicted values stay separate. Not a warning center, incident source, evacuation order, bridge closure or global bulk source.
        </div>
        <div className="mt-3 rounded-lg border border-indigo-300/20 bg-indigo-300/10 p-3 text-xs leading-5 text-indigo-100">
          NOAA Storm Events Historical: NOAA/NCEI official historical severe-weather records for United States and NOAA/NWS territories. Controlled import by year/state/event type/limit only; do not import all history at once or treat it as live alerts.
        </div>
        <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
          Historical tsunami data supports ARGUS memory and simulation; it is not a live warning or evacuation order. Cite NCEI/WDS Global Historical Tsunami Database, DOI 10.7289/V5PN93H7.
        </div>
        <div className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 p-3 text-xs leading-5 text-sky-100">
          OpenFEMA Disaster Declarations: FEMA/OpenFEMA institutional records for United States and FEMA territories. FEMA precedent supports ARGUS recommendations but does not create official FEMA instructions or promise federal assistance.
        </div>
        <div className="mt-5">
          <KnowledgeDomainFilter value={filter} onChange={setFilter} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-6">
          <KnowledgeInputUploadPanel sources={sources} onPreview={setPreviewIncident} />
          {previewIncident && (
            <section className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              Vista previa normalizada localmente. No fue guardada ni enviada a una fuente externa.
            </section>
          )}
          <div className="grid gap-4">
            {(previewIncident ? [previewIncident, ...liveIncidents, ...filteredIncidents] : [...liveIncidents, ...filteredIncidents]).slice(0, 8).map((incident) => (
              <IncidentKnowledgeCard key={incident.id} incident={incident} />
            ))}
          </div>
          <KnowledgeSourceRegistryPanel sources={sources} />
        </div>
        <aside className="grid h-fit gap-6">
          <section className="rounded-lg border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs font-semibold uppercase text-cyan-200">Dominios con informacion</p>
            <div className="mt-4 grid gap-2">
              {domainStats.map(([domain, count]) => (
                <div key={domain} className="flex items-center justify-between rounded border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <span className="text-slate-200">{domain}</span>
                  <span className="font-semibold text-cyan-100">{count}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs font-semibold uppercase text-emerald-200">Memoria persistente</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Incidentes DB" value={healthSummary?.persistedIncidents ?? 0} />
              <Metric label="Docs DB" value={healthSummary?.persistedDocuments ?? 0} />
              <Metric label="Lecciones DB" value={healthSummary?.persistedLessons ?? 0} />
              <Metric label="Pendientes" value={healthSummary?.pendingReviews ?? 0} />
            </div>
            <div className="mt-4 grid gap-2">
              {(healthSummary?.latestIngestionRuns ?? []).slice(0, 4).map((run) => (
                <div key={run.id} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  <span className="font-semibold text-white">{run.sourceId}</span> · {run.status} · +{run.recordsInserted ?? 0} / ~{run.recordsUpdated ?? 0} / skip {run.recordsSkipped ?? 0}
                </div>
              ))}
              {!healthSummary && <p className="text-xs text-slate-500">Pulsa Actualizar memoria para consultar DB.</p>}
            </div>
          </section>
          <section className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
            GDACS y NASA EONET son fuentes globales de awareness. NWS es fuente oficial para Estados Unidos y territorios NWS, no cobertura mundial completa. ReliefWeb requiere appname aprobado, FIRMS requiere MAP_KEY.
          </section>
          <SimilarIncidentsPanel incident={selectedIncident} />
          <LessonsLearnedPanel domain={selectedIncident.domain} />
          <section className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-4 text-xs leading-5 text-rose-100">
            Las recomendaciones del modulo son informativas. No usar fuentes de baja confianza para decisiones criticas sin validacion humana e institucional.
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
