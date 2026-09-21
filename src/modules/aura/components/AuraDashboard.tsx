"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import { auraDemoProfile, auraDemoStock, auraDemoTriageCases } from "@/modules/aura/data";
import { useNearbyMedicalPoints } from "@/hooks/useNearbyMedicalPoints";
import { loadOperationalEvents } from "@/lib/modules/loadOperationalEvents";
import type { CrisisEvent } from "@/types/crisis";
import { canUseAuraFeature, resolveAuraModuleAccess, resolveAuraRole } from "@/modules/aura/auraAccess";
import { auditAuraAction } from "@/modules/aura/auraAudit";
import { getAuraProfileCompleteness } from "@/modules/aura/auraMedicalProfile";
import { sanitizeAuraMedicalProfileForRole } from "@/modules/aura/auraPrivacy";
import AuraMedicalRoutePanel from "@/components/aura/AuraMedicalRoutePanel";
import { getModuleById } from "@/data/argusModules";
import ModuleMaturityBadge from "@/components/modules/ModuleMaturityBadge";

const auraModule = getModuleById("argus-aura");

function Panel({ title, children, tone = "cyan" }: { title: string; children: React.ReactNode; tone?: "cyan" | "rose" | "amber" | "emerald" }) {
  const color = {
    cyan: "border-cyan-300/20 text-cyan-200",
    rose: "border-rose-300/20 text-rose-200",
    amber: "border-amber-300/20 text-amber-200",
    emerald: "border-emerald-300/20 text-emerald-200",
  }[tone];
  return (
    <section className={`border bg-slate-950/80 p-4 shadow-xl shadow-black/20 ${color}`}>
      <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.18em]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function AuraDashboard() {
  const { user, loading } = useSession();
  const location = useUserLocation();
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const role = resolveAuraRole(user);
  const access = resolveAuraModuleAccess(role);
  const profile = useMemo(() => sanitizeAuraMedicalProfileForRole(auraDemoProfile, role), [role]);
  // Real health facilities near the user (CriticalPoi); the server only serves the demo fixture where allowed.
  const { points: nearbyMedicalPoints, source: medicalPointsSource } = useNearbyMedicalPoints(location.latitude, location.longitude);
  // Canonical health incidents (ingestion pipeline) + the server's demo-data permission.
  const [healthIncidents, setHealthIncidents] = useState<CrisisEvent[]>([]);
  const [demoFallbackAllowed, setDemoFallbackAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadOperationalEvents("argus-aura")
      .then((loaded) => {
        if (cancelled) return;
        setDemoFallbackAllowed(loaded.demoFallbackAllowed);
        setHealthIncidents(loaded.canonical.filter((event) => event.category === "emergencia medica" && event.status !== "RESOLVED"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  // Triage cases, stock and the sample profile have no backend yet (AURA Pro):
  // shown only where demo data is allowed, never in production.
  const triageCases = demoFallbackAllowed ? auraDemoTriageCases : [];
  const stock = demoFallbackAllowed ? auraDemoStock : [];
  const usesDemoData = demoFallbackAllowed || medicalPointsSource === "demo";
  const selectedMedicalPoint = nearbyMedicalPoints.find((point) => point.id === selectedPointId) ?? null;
  const canSeeProfessional = canUseAuraFeature(role, "view_professional_dashboard");
  const canSeeStock = canUseAuraFeature(role, "view_medical_stock");
  const canSeeSensitive = canUseAuraFeature(role, "view_sensitive_medical_data");

  useEffect(() => {
    if (!loading && access.canEnter) auditAuraAction({ userId: user?.id, userRole: role, action: "module_view", reason: "aura_dashboard_opened" });
  }, [access.canEnter, loading, role, user?.id]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando ARGUS AURA...</main>;
  }

  if (!access.canEnter) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <section className="max-w-xl border border-rose-300/25 bg-slate-900 p-6">
          <h1 className="text-xl font-bold">ARGUS AURA</h1>
          <p className="mt-2 text-sm text-slate-300">{access.reason}</p>
          <a className="mt-4 inline-flex border border-white/10 px-3 py-2 text-sm text-slate-200" href="/modules">Volver a modulos</a>
        </section>
      </main>
    );
  }

  const kpis = [
    ["Puntos medicos cercanos", nearbyMedicalPoints.length],
    ["Hospitales / urgencias", nearbyMedicalPoints.filter((point) => point.type === "hospital" || point.type === "sapu").length],
    ["Alertas sanitarias activas", healthIncidents.length],
    ["Casos activos", demoFallbackAllowed ? triageCases.filter((item) => item.status !== "closed").length : "Sin backend"],
    ["Casos criticos", demoFallbackAllowed ? triageCases.filter((item) => item.urgency === "critical").length : "Sin backend"],
    ["Stock critico", demoFallbackAllowed ? stock.filter((item) => item.status === "critical").length : "Sin backend"],
    ["Perfil completo", demoFallbackAllowed ? `${getAuraProfileCompleteness(auraDemoProfile)}%` : "En tu dispositivo"],
    ["Fuente puntos medicos", medicalPointsSource === "critical_poi" ? "Catalogo real" : medicalPointsSource === "demo" ? "Demo" : "Sin datos"],
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-rose-300">Emergencia medica y coordinacion sanitaria</p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em]">ARGUS AURA</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-xs font-bold uppercase text-rose-100">Publico / Medico profesional</span>
            {auraModule?.maturity && <ModuleMaturityBadge maturity={auraModule.maturity} />}
            {usesDemoData && (
              <span className="border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">Incluye datos de prueba</span>
            )}
            <span className="border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100">Rol: {role}</span>
            <a href="/modules" className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">Volver a modulos</a>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-4 py-5 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(([label, value]) => (
            <div key={label} className="border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-4">
            <Panel title="Capa publica/base" tone="rose">
              <div className="grid gap-3 sm:grid-cols-2">
                <button className="min-h-16 border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-left text-sm font-bold uppercase text-rose-50">Emergencia medica</button>
                <button className="min-h-16 border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold uppercase text-slate-200">Activar SOS</button>
                <button className="border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-xs text-slate-300">Ver punto medico cercano</button>
                <button className="border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-xs text-slate-300">Crear reporte medico en VIGIA</button>
              </div>
              <p className="mt-3 border border-rose-300/15 bg-rose-400/8 p-3 text-sm leading-6 text-rose-100">
                Sus datos medicos son opcionales y solo deben compartirse si usted lo decide. AURA no diagnostica ni promete ambulancias, camas o atencion garantizada.
              </p>
            </Panel>

            <Panel title="Puntos medicos cercanos">
              <div className="grid gap-3 md:grid-cols-3">
                {nearbyMedicalPoints.length === 0 && (
                  <p className="text-sm text-slate-400">No hay puntos medicos registrados cerca de tu ubicacion.</p>
                )}
                {nearbyMedicalPoints.slice(0, 9).map((point) => {
                  const isSelected = point.id === selectedPointId;
                  return (
                    <button
                      type="button"
                      key={point.id}
                      onClick={() => setSelectedPointId(isSelected ? null : point.id)}
                      className={`border p-3 text-left ${
                        isSelected ? "border-cyan-300/40 bg-cyan-400/10" : "border-white/10 bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white">{point.name}</h3>
                        <span className="border border-cyan-300/20 px-2 py-1 text-[0.6rem] uppercase text-cyan-100">{point.type}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{point.capabilities.join(" · ") || "Servicios no informados"}</p>
                      <p className="mt-2 text-xs text-slate-300">
                        Disponibilidad: {point.availabilityStatus === "unknown" ? "no informada" : point.availabilityStatus}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {point.distanceKm !== undefined ? `${point.distanceKm} km` : "Distancia no calculada"}
                        {point.isDemo && <span className="ml-1 text-amber-300/80">(demo)</span>}
                      </p>
                    </button>
                  );
                })}
              </div>

              {selectedMedicalPoint && (
                <div className="mt-3">
                  <AuraMedicalRoutePanel
                    point={selectedMedicalPoint}
                    origin={{ lat: location.latitude, lng: location.longitude }}
                  />
                  <Link
                    href={`/app?sosMedicalPointId=${selectedMedicalPoint.id}`}
                    className="mt-2 inline-flex min-h-9 items-center justify-center border border-cyan-300/25 bg-cyan-400/10 px-3 text-xs font-bold uppercase text-cyan-100"
                  >
                    Ver ruta en mapa operacional (SOS Medico)
                  </Link>
                </div>
              )}
            </Panel>

            {canSeeProfessional && (
              <Panel title="Panel profesional" tone="amber">
                <div className="grid gap-3 lg:grid-cols-3">
                  {triageCases.length === 0 && (
                    <p className="text-sm text-slate-400">AURA Pro todavia no tiene backend de casos clinicos: no hay casos que mostrar.</p>
                  )}
                  {triageCases.map((item) => (
                    <article key={item.id} className="border border-white/10 bg-white/[0.035] p-3">
                      <p className="text-xs font-bold uppercase text-amber-100">{item.urgency}</p>
                      <h3 className="mt-1 text-sm font-semibold">{item.category}</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{item.notes}</p>
                      <p className="mt-2 text-xs text-slate-300">Traslado: {item.transportRequired ? "pendiente" : "no requerido"}</p>
                    </article>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          <aside className="grid auto-rows-max gap-4">
            <Panel title="Perfil medico opcional" tone="rose">
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Grupo sanguineo</dt><dd>{profile.bloodType ?? "Protegido"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Contacto</dt><dd>{profile.emergencyContact ? "Disponible" : "No visible"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Visibilidad</dt><dd>{profile.visibility}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Datos sensibles</dt><dd>{canSeeSensitive ? "Auditados" : "Ocultos"}</dd></div>
              </dl>
            </Panel>

            {canSeeStock && (
              <Panel title="Stock medico" tone="amber">
                <div className="grid gap-2">
                  {stock.length === 0 && <p className="text-sm text-slate-400">Sin inventario medico conectado.</p>}
                  {stock.map((item) => (
                    <div key={item.id} className="border border-white/10 bg-white/[0.03] p-2 text-sm">
                      <div className="flex justify-between gap-3"><span>{item.name}</span><strong className="uppercase">{item.status}</strong></div>
                      <p className="mt-1 text-xs text-slate-400">{item.quantity} {item.unit} · {item.restricted ? "restringido" : "operacional"}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel title="Integraciones preparadas" tone="emerald">
              <ul className="grid gap-2 text-sm text-slate-300">
                <li>HERMES: destino, urgencia y prioridad sin ficha medica.</li>
                <li>ARCA: puntos medicos en refugios y necesidades agregadas.</li>
                <li>NEXUS: insumos y traslados agregados, sin datos personales.</li>
                <li>ATLAS/FENIX/TALOS/VIGIA/ORACULO: senales sanitarias agregadas.</li>
              </ul>
            </Panel>
          </aside>
        </section>
      </main>
    </div>
  );
}
