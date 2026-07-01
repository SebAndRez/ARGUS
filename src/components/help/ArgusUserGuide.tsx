import GuideCard from "@/components/help/GuideCard";
import GuideSection from "@/components/help/GuideSection";
import {
  faq,
  glossary,
  guideLayers,
  quickActions,
  reportTypes,
  scenarios,
  statusDescriptions,
  type GuideStatus,
} from "@/data/argusUserGuide";

const statusStyles: Record<GuideStatus, string> = {
  real: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  official: "border-red-300/30 bg-red-400/10 text-red-100",
  external: "border-blue-300/30 bg-blue-400/10 text-blue-100",
  citizen: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  estimate: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
  experimental: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100",
  demo: "border-slate-300/25 bg-slate-400/10 text-slate-100",
  runtime: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  future: "border-white/20 bg-white/5 text-slate-200",
};

const navItems = [
  ["intro", "Inicio"],
  ["mapa", "Mapa"],
  ["capas", "Capas"],
  ["reportes", "Reportes"],
  ["sos", "SOS"],
  ["safety", "Safety Check"],
  ["fuentes", "Fuentes"],
  ["validacion", "Validacion"],
  ["situaciones", "Situaciones"],
  ["satelital", "Conexion remota"],
  ["limites", "Limites"],
  ["faq", "FAQ"],
] as const;

function StatusBadge({ status }: { status: GuideStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.12em] ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-slate-300">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ArgusUserGuide() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-5 rounded-lg border border-cyan-300/15 bg-slate-950/84 p-3 shadow-2xl shadow-black/25">
            <p className="px-2 text-[0.58rem] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Indice
            </p>
            <div className="mt-3 grid gap-1">
              {navItems.map(([href, label]) => (
                <a
                  key={href}
                  href={`#${href}`}
                  className="rounded border border-transparent px-2 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-400/10 hover:text-cyan-100"
                >
                  {label}
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0">
          <section id="intro" className="rounded-lg border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),rgba(2,6,23,0.92)] p-5 shadow-2xl shadow-black/30 sm:p-7">
            <div className="max-w-4xl">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-cyan-300">
                ARGUS User Guide
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Como usar ARGUS
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
                ARGUS ayuda a ver riesgos, reportar incidentes, pedir ayuda, validar informacion y coordinar mejor durante emergencias o crisis.
              </p>
              <p className="mt-4 max-w-3xl rounded-lg border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                ARGUS no reemplaza a las autoridades ni a los servicios de emergencia. Es una herramienta de apoyo para mejorar informacion, coordinacion y tiempos de respuesta.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <span key={action} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">
                  {action}
                </span>
              ))}
            </div>
          </section>

          <GuideSection
            id="que-es"
            title="Que es ARGUS"
            intro="ARGUS es una plataforma de inteligencia de crisis que combina mapa operativo, reportes ciudadanos, fuentes externas, estimaciones, capas de riesgo, modulos de seguridad y herramientas de coordinacion basica."
          >
            <div className="grid gap-3 md:grid-cols-2">
              {[
                "Anticipar y entender mejor que ocurre cerca.",
                "Comunicar incidentes sin depender de rumores.",
                "Coordinar familia, comunidad, voluntarios o equipos.",
                "Distinguir informacion oficial, externa, ciudadana, demo y experimental.",
              ].map((item) => (
                <GuideCard key={item} title={item}>
                  ARGUS apoya el criterio humano y la instruccion oficial. No reemplaza decision de autoridad, despacho de emergencia ni preparacion personal.
                </GuideCard>
              ))}
            </div>
          </GuideSection>

          <GuideSection
            id="para-que"
            title="Para que sirve"
            intro="ARGUS sirve para ordenar senales en crisis: incidentes cercanos, fuentes, reportes, rutas, capas de riesgo y estados de personas."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                "Saber que ocurre cerca",
                "Reportar un problema",
                "Pedir ayuda con SOS",
                "Avisar estado con Safety Check",
                "Ver fuentes externas",
                "Reducir duplicacion de reportes",
                "Apoyar evacuaciones con orientacion visual",
                "Mejorar logistica basica de respuesta",
                "Conectar zonas aisladas si hay internet",
              ].map((item) => (
                <GuideCard key={item} title={item}>
                  Use esta capacidad como apoyo. En riesgo inmediato, proteja la vida primero y siga instrucciones oficiales.
                </GuideCard>
              ))}
            </div>
          </GuideSection>

          <GuideSection
            id="presion"
            title="Informacion clara bajo presion"
            intro="En una crisis el peligro no es el unico problema. Tambien hay falta de informacion, rumores, reportes duplicados, rutas cortadas, personas desaparecidas y mala coordinacion."
          >
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 p-5 text-lg font-semibold leading-8 text-cyan-50">
              Mejor informacion no elimina el riesgo, pero puede mejorar decisiones.
            </div>
          </GuideSection>

          <GuideSection
            id="mapa"
            title="Mapa operativo"
            intro="El mapa es la pantalla principal de ARGUS. Muestra ubicacion, incidentes, fuentes, capas, detalles, leyendas y botones de accion."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <GuideCard title="Como leerlo">
                <BulletList
                  items={[
                    "Active o desactive capas segun lo que necesita ver.",
                    "Abra el detalle de un incidente para leer fuente, estado, severidad y recomendacion.",
                    "Use colores y badges como ayuda, no como unica referencia.",
                    "Si no aparece informacion cerca, puede no haber reportes o puede faltar conexion.",
                  ]}
                />
              </GuideCard>
              <GuideCard title="Botones principales">
                <BulletList
                  items={[
                    "SOS: emergencia real o ayuda urgente.",
                    "Reportar: incidente no necesariamente urgente.",
                    "Modulos: QuakeSense, Safety, AURA o Fenix segun disponibilidad.",
                    "Capas: controla fuentes externas, reportes, rutas y riesgo visual.",
                  ]}
                />
              </GuideCard>
            </div>
          </GuideSection>

          <GuideSection id="capas" title="Capas del mapa" intro="Una capa es una vista de informacion sobre el mapa. Cada capa debe leerse segun su estado.">
            <div className="grid gap-3">
              {guideLayers.map((layer) => (
                <GuideCard key={layer.title} title={layer.title} eyebrow="Capa ARGUS">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={layer.status} />
                    <span className="text-xs text-slate-400">{statusDescriptions[layer.status]}</span>
                  </div>
                  <p>{layer.body}</p>
                  <div className="mt-3">
                    <BulletList items={layer.cautions} />
                  </div>
                </GuideCard>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="reportes" title="Que es un reporte" intro="Un reporte es una senal enviada por una persona para informar algo que esta ocurriendo. Ubicacion y hora son claves.">
            <div className="grid gap-3 md:grid-cols-2">
              {reportTypes.map((item) => (
                <GuideCard key={item.title} title={item.title}>
                  <p><strong className="text-cyan-100">Uselo cuando:</strong> {item.useWhen}</p>
                  <p className="mt-2"><strong className="text-amber-100">No lo use cuando:</strong> {item.avoidWhen}</p>
                  <p className="mt-2"><strong className="text-slate-100">Agregue:</strong> {item.include}</p>
                </GuideCard>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="sos" title="Boton SOS" intro="SOS se usa cuando la persona o alguien cercano enfrenta una emergencia real o necesita ayuda urgente.">
            <div className="grid gap-3 md:grid-cols-2">
              <GuideCard title="Use SOS para">
                <BulletList items={["accidente grave", "persona herida", "atrapamiento", "peligro inmediato", "perdida en zona aislada", "emergencia medica", "amenaza directa"]} />
              </GuideCard>
              <GuideCard title="No use SOS para">
                <BulletList items={["probar la app sin modo demo", "bromas", "reportes no urgentes", "comentarios generales"]} />
              </GuideCard>
            </div>
            <p className="mt-4 rounded-lg border border-red-300/20 bg-red-400/10 p-4 text-sm leading-6 text-red-100">
              Use SOS solo si existe una emergencia real. ARGUS puede ayudar a registrar y visibilizar su solicitud, pero si tiene senal telefonica debe contactar tambien a los servicios de emergencia de su zona.
            </p>
          </GuideSection>

          <GuideSection id="safety" title="Safety Check" intro="Safety Check permite indicar estado durante o despues de una emergencia: estoy bien, necesito ayuda, no puedo responder, pendiente o requiere seguimiento.">
            <div className="grid gap-3 md:grid-cols-2">
              <GuideCard title="Para que ayuda">
                <BulletList items={["reducir incertidumbre", "priorizar busqueda", "evitar llamadas duplicadas", "coordinar familia o equipos", "saber quien necesita apoyo"]} />
              </GuideCard>
              <GuideCard title="Advertencia actual">
                En esta fase, Safety Check puede estar en modo demo/runtime y no reemplaza una llamada o aviso directo a servicios de emergencia.
              </GuideCard>
            </div>
          </GuideSection>

          <GuideSection id="fuentes" title="Que son las fuentes" intro="Una fuente es el origen de un dato. ARGUS puede mostrar datos oficiales, externos, ciudadanos, estimaciones propias, demo, runtime, experimentales o futuras.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(statusDescriptions) as GuideStatus[]).map((status) => (
                <GuideCard key={status} title={status.toUpperCase()}>
                  <StatusBadge status={status} />
                  <p className="mt-3">{statusDescriptions[status]}</p>
                </GuideCard>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="validacion" title="Como se valida la informacion" intro="ARGUS valida para reducir rumores, duplicados, reportes falsos y decisiones basadas en informacion debil. No validado no significa falso; significa que falta confirmacion.">
            <div className="grid gap-3 md:grid-cols-2">
              <GuideCard title="Metodos de validacion">
                <BulletList items={["coincidencia con fuentes externas", "multiples reportes cercanos", "hora y cercania geografica", "reputacion de usuario", "evidencia adjunta", "revision administrativa", "deteccion de duplicados"]} />
              </GuideCard>
              <GuideCard title="Estados comunes">
                <BulletList items={["Nuevo", "Preliminar", "En revision", "Validado", "Rechazado", "Duplicado", "Resuelto", "Expirado"]} />
              </GuideCard>
            </div>
          </GuideSection>

          <GuideSection id="reputacion" title="Reputacion y sanciones" intro="La reputacion ayuda a estimar confiabilidad de reportes ciudadanos, pero no debe castigar perfiles incompletos ni bloquear SOS.">
            <GuideCard title="Regla de seguridad">
              Reportes utiles pueden mejorar confianza y reportes falsos pueden reducirla. QuakeSense y Safety no deben sancionar automaticamente. Las decisiones sensibles requieren revision humana o administrativa.
            </GuideCard>
          </GuideSection>

          <GuideSection id="situaciones" title="Que hacer segun la situacion" intro="Estas guias son orientativas. Proteja la vida primero y siga instrucciones de autoridades locales.">
            <div className="grid gap-3">
              {scenarios.map((scenario) => (
                <GuideCard key={scenario.title} title={scenario.title}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="font-semibold text-cyan-100">Que mirar en ARGUS</p>
                      <BulletList items={scenario.lookAt} />
                    </div>
                    <div>
                      <p className="font-semibold text-cyan-100">Que reportar</p>
                      <BulletList items={scenario.report} />
                    </div>
                    <div>
                      <p className="font-semibold text-amber-100">Que no hacer</p>
                      <BulletList items={scenario.avoid} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-100">Recomendacion practica</p>
                      <p className="mt-2">{scenario.practical}</p>
                      <p className="mt-3 text-slate-400"><strong>Limite:</strong> {scenario.limit}</p>
                    </div>
                  </div>
                </GuideCard>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="satelital" title="Uso con internet satelital o conexion remota" intro="ARGUS puede ser util en zonas rurales, aisladas, de montana, costa, bosques, campamentos, faenas o post-desastre si existe alguna conexion a internet.">
            <div className="grid gap-3 md:grid-cols-2">
              <GuideCard title="Puede ayudar a">
                <BulletList items={["mantener acceso al mapa", "enviar reportes", "usar Safety Check", "coordinar grupos", "informar rutas cortadas", "apoyar logistica de agua, alimento, refugio o rescate"]} />
              </GuideCard>
              <GuideCard title="Consejos practicos">
                <BulletList items={["llevar powerbank", "proteger router y antena del agua", "priorizar mensajes breves", "evitar archivos pesados con conexion debil", "tomar capturas de mapas", "mantener plan B: radio, linterna, botiquin"]} />
              </GuideCard>
            </div>
            <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              ARGUS depende de energia, dispositivo funcional y conectividad. Si no hay senal, bateria o acceso a internet, puede no funcionar.
            </p>
          </GuideSection>

          <GuideSection id="checklists" title="Antes, durante y despues" intro="Use estos listados como preparacion rapida, no como reemplazo de planes locales.">
            <div className="grid gap-3 md:grid-cols-3">
              <GuideCard title="Antes">
                <BulletList items={["crear cuenta", "revisar permisos de ubicacion", "entender SOS", "guardar contactos", "tener bateria externa", "conocer rutas y fuentes oficiales", "explicar ARGUS a familia o equipo"]} />
              </GuideCard>
              <GuideCard title="Durante">
                <BulletList items={["proteger vida primero", "usar la app solo si es seguro", "usar SOS si hay emergencia real", "reportar con precision", "no difundir rumores", "ahorrar bateria"]} />
              </GuideCard>
              <GuideCard title="Despues">
                <BulletList items={["confirmar estado", "reportar danos", "marcar rutas cortadas", "actualizar incidentes resueltos", "validar informacion si es seguro", "revisar fuentes oficiales"]} />
              </GuideCard>
            </div>
          </GuideSection>

          <GuideSection id="vidas" title="Como ARGUS puede ayudar a salvar vidas" intro="ARGUS puede ayudar de forma indirecta: reducir tiempo para detectar incidentes, visibilizar personas que necesitan ayuda, ordenar reportes y apoyar rutas o logistica.">
            <GuideCard title="Precision necesaria">
              ARGUS no elimina el riesgo, no garantiza rescate, no reemplaza servicios oficiales y no debe ser la unica herramienta de preparacion.
            </GuideCard>
          </GuideSection>

          <GuideSection id="limites" title="Limites de ARGUS" intro="ARGUS no puede garantizar que todo dato sea verdadero, que una ruta sea segura, que haya despacho oficial, que siempre exista conexion o que sensores funcionen igual en todos los telefonos.">
            <div className="grid gap-3 md:grid-cols-2">
              <GuideCard title="No garantiza">
                <BulletList items={["veracidad sin validacion", "ruta segura", "servicio despachado", "conexion permanente", "deteccion de todos los sismos", "fuentes externas siempre disponibles"]} />
              </GuideCard>
              <GuideCard title="En 30 segundos">
                <BulletList items={["Abra el mapa", "Revise capas activas", "Mire fuente y confianza", "Use SOS solo en emergencia real", "Use Reportar para incidentes", "Use Safety Check", "Siga instrucciones oficiales", "No difunda rumores", "Ahorre bateria"]} />
              </GuideCard>
            </div>
          </GuideSection>

          <GuideSection id="glosario" title="Glosario" intro="Terminos basicos para leer ARGUS con menos friccion.">
            <div className="grid gap-2 md:grid-cols-2">
              {glossary.map(([term, definition]) => (
                <div key={term} className="rounded border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-sm font-semibold text-white">{term}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{definition}</p>
                </div>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="faq" title="Preguntas frecuentes">
            <div className="grid gap-3">
              {faq.map(([question, answer]) => (
                <GuideCard key={question} title={question}>
                  {answer}
                </GuideCard>
              ))}
            </div>
          </GuideSection>
        </div>
      </div>
    </main>
  );
}
