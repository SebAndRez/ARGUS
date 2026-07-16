"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { custosDemoAuditTrail, custosDemoReason } from "@/modules/custos/data";
import { getCustosAccessLevel, resolveCustosModuleAccess, resolveCustosRole } from "@/modules/custos/custosAccess";
import { auditCustosAction } from "@/modules/custos/custosAudit";
import { validateCustosOperationalReason } from "@/modules/custos/custosOperationalReason";
import { performCustosSearch } from "@/modules/custos/custosSearch";
import type { CustosOperationalReason, CustosSearchResponse, CustosSearchType } from "@/modules/custos/types";
import { getModuleById } from "@/data/argusModules";
import ModuleMaturityBadge from "@/components/modules/ModuleMaturityBadge";

const custosModule = getModuleById("argus-custos");

function Panel({ title, children, danger = false }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={`border bg-slate-950/85 p-4 shadow-xl shadow-black/25 ${danger ? "border-red-300/25" : "border-cyan-300/18"}`}>
      <h2 className={`text-[0.7rem] font-bold uppercase tracking-[0.18em] ${danger ? "text-red-200" : "text-cyan-200"}`}>{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function CustosDashboard() {
  const { user, loading } = useSession();
  const role = resolveCustosRole(user);
  const access = resolveCustosModuleAccess(role);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [reason, setReason] = useState<CustosOperationalReason>({ ...custosDemoReason, requestedByRole: role, requestedByUserId: user?.id ?? "demo-user" });
  const [query, setQuery] = useState("Persona demo");
  const [searchType, setSearchType] = useState<CustosSearchType>("identity");
  const [response, setResponse] = useState<CustosSearchResponse | null>(null);
  const validation = useMemo(() => validateCustosOperationalReason(reason), [reason]);
  const accessLevel = getCustosAccessLevel(role);

  useEffect(() => {
    if (loading) return;
    auditCustosAction({ userId: user?.id, userRole: role, action: access.canEnter ? "module_opened" : "access_denied", redacted: true });
  }, [access.canEnter, loading, role, user?.id]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando ARGUS CUSTOS...</main>;

  if (!access.canEnter) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <section className="max-w-xl border border-red-300/25 bg-slate-900 p-6">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-red-300">Acceso denegado</p>
          <h1 className="mt-2 text-2xl font-bold">ARGUS CUSTOS</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Modulo restringido institucional. No se muestran datos, busquedas ni resultados a usuarios no autorizados.</p>
          <p className="mt-2 text-sm text-red-100">{access.reason}</p>
          <a href="/modules" className="mt-4 inline-flex border border-white/10 px-3 py-2 text-sm text-slate-200">Volver a modulos</a>
        </section>
      </main>
    );
  }

  function acceptLegalWarning() {
    setLegalAccepted(true);
    auditCustosAction({ userId: user?.id, userRole: role, action: "legal_warning_accepted", redacted: true });
  }

  function runSearch() {
    const result = performCustosSearch({ searchType, query, operationalReason: reason, userRole: role, userId: user?.id ?? "demo-user" });
    setResponse(result);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-red-300">Busqueda institucional auditada</p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em]">ARGUS CUSTOS</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Acceso restringido. Toda consulta requiere motivo operacional y queda auditada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="border border-red-300/25 bg-red-400/10 px-3 py-1.5 text-xs font-bold uppercase text-red-100">Restringido</span>
            <span className="border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100">Rol: {role}</span>
            <span className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">Nivel: {accessLevel}</span>
            <a href="/modules" className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">Volver a modulos</a>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-100">
          {custosModule?.maturity && <ModuleMaturityBadge maturity={custosModule.maturity} />}
          <span>Datos protegidos de prueba. No hay bases reales de identidad, ubicaciones exactas ni datos medicos.</span>
        </div>

        {!legalAccepted ? (
          <Panel title="Acceso restringido institucional" danger>
            <div className="grid gap-3 text-sm leading-6 text-slate-300">
              <p>ARGUS CUSTOS esta reservado para usuarios policiales o autoridades autorizadas. Toda consulta queda auditada.</p>
              <p>Debe existir un motivo operacional valido para continuar. No utilice este modulo para consultas personales, curiosidad, vigilancia no autorizada o fines ajenos a una operacion legitima.</p>
              <button onClick={acceptLegalWarning} className="justify-self-start border border-red-300/35 bg-red-500/15 px-4 py-2 text-xs font-bold uppercase text-red-50">Declaro entender y continuar</button>
            </div>
          </Panel>
        ) : (
          <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="grid auto-rows-max gap-4">
              <Panel title="Motivo operacional" danger>
                <div className="grid gap-3 text-sm">
                  <label className="grid gap-1 text-slate-300">Tipo<select value={reason.type} onChange={(event) => setReason({ ...reason, type: event.target.value as CustosOperationalReason["type"] })} className="border border-white/10 bg-slate-900 p-2 text-white"><option value="missing_person">Persona desaparecida</option><option value="family_reunification">Reunificacion familiar</option><option value="lawful_police_operation">Operacion policial autorizada</option><option value="court_or_authority_request">Requerimiento autoridad</option><option value="humanitarian_status_check">Estado humanitario</option></select></label>
                  <label className="grid gap-1 text-slate-300">Caso / operacion<input value={reason.caseId ?? ""} onChange={(event) => setReason({ ...reason, caseId: event.target.value })} className="border border-white/10 bg-slate-900 p-2 text-white" /></label>
                  <label className="grid gap-1 text-slate-300">Descripcion<textarea value={reason.description} onChange={(event) => setReason({ ...reason, description: event.target.value })} className="min-h-24 border border-white/10 bg-slate-900 p-2 text-white" /></label>
                  <div className="border border-white/10 bg-white/[0.03] p-2 text-xs text-slate-300">Declaro que esta consulta corresponde a una operacion autorizada.</div>
                  {validation.errors.length > 0 && <div className="border border-red-300/25 bg-red-400/10 p-2 text-xs text-red-100">{validation.errors.join(" ")}</div>}
                  {validation.warnings.length > 0 && <div className="border border-amber-300/25 bg-amber-400/10 p-2 text-xs text-amber-100">{validation.warnings.join(" ")}</div>}
                </div>
              </Panel>

              <Panel title="Panel de busqueda">
                <div className="grid gap-3 text-sm">
                  <label className="grid gap-1 text-slate-300">Tipo de busqueda<select value={searchType} onChange={(event) => setSearchType(event.target.value as CustosSearchType)} className="border border-white/10 bg-slate-900 p-2 text-white"><option value="identity">Identidad protegida</option><option value="alias">Alias</option><option value="case_id">ID de caso</option><option value="safe_status">Estado humanitario</option><option value="shelter_registry">Registro refugio</option><option value="medical_transfer_status">Traslado medico general</option><option value="zone_presence_aggregate">Presencia agregada en zona</option></select></label>
                  <label className="grid gap-1 text-slate-300">Criterio<input value={query} onChange={(event) => setQuery(event.target.value)} className="border border-white/10 bg-slate-900 p-2 text-white" /></label>
                  <button disabled={!validation.valid} onClick={runSearch} className="border border-cyan-300/30 bg-cyan-500/12 px-4 py-2 text-xs font-bold uppercase text-cyan-50 disabled:opacity-40">Buscar con auditoria</button>
                </div>
              </Panel>
            </aside>

            <div className="grid auto-rows-max gap-4">
              <Panel title="Resultados redactados">
                {!response ? (
                  <p className="text-sm text-slate-400">Ejecute una busqueda demo con motivo operacional valido. No se consulta ningun backend real.</p>
                ) : (
                  <div className="grid gap-3">
                    {response.warnings.length > 0 && <div className="border border-amber-300/25 bg-amber-400/10 p-2 text-xs text-amber-100">{response.warnings.join(" ")}</div>}
                    {response.results.map((result) => (
                      <article key={result.id} className="border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">{result.displayName}</h3>
                            <p className="mt-1 text-xs text-slate-400">{result.lastKnownContext?.label ?? "Contexto protegido"} · {result.status}</p>
                          </div>
                          <span className="border border-red-300/25 bg-red-400/10 px-2 py-1 text-[0.6rem] uppercase text-red-100">{result.visibility}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-300">Ubicacion: {result.lastKnownContext?.locationLabel ?? "protegida"} · Confianza: {result.confidence}</p>
                        <ul className="mt-2 grid gap-1 text-xs text-amber-100">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                        <div className="mt-3 flex flex-wrap gap-2">{result.allowedActions.map((action) => <button key={action} className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.65rem] uppercase text-slate-300">{action}</button>)}</div>
                      </article>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Detalle protegido">
                <p className="text-sm leading-6 text-slate-300">La vista de detalle solo muestra estado humanitario general, fuente, modulos relacionados y auditoria de consulta. Ubicacion exacta, datos medicos, documentos y terceros permanecen ocultos por defecto.</p>
              </Panel>

              <Panel title="Auditoria">
                <div className="grid gap-2">
                  {custosDemoAuditTrail.map((entry) => (
                    <div key={entry.id} className="grid gap-1 border border-white/10 bg-white/[0.03] p-2 text-xs text-slate-300 sm:grid-cols-4">
                      <span>{entry.action}</span>
                      <span>{entry.role}</span>
                      <span>{new Date(entry.timestamp).toLocaleString("es-CL")}</span>
                      <span>{entry.result}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Integraciones preparadas">
                <ul className="grid gap-2 text-sm text-slate-300">
                  <li>ATLAS recibe solo resumen agregado, sin ubicacion exacta.</li>
                  <li>VIGIA aporta contexto de desaparecidos o ayuda, sin reportantes.</li>
                  <li>ARCA aporta check-ins seguros y aproximados.</li>
                  <li>AURA aporta estado medico general, nunca ficha clinica.</li>
                  <li>TALOS, ORACULO y HERMES quedan disponibles solo con caso autorizado.</li>
                </ul>
              </Panel>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
