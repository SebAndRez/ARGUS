import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseLogPath = resolve(root, "src/data/argusReleaseLog.ts");

const ARRAY_START = "export const argusReleaseLog: ArgusReleaseEntry[] = ";

const keywordRules = [
  { match: ["mapa", "map"], module: "Mapa operativo", change: "Se ajustaron componentes del mapa operativo." },
  { match: ["capa", "layer"], module: "Capas en tiempo real", change: "Se ajustaron capas del mapa operativo." },
  { match: ["reporte", "report", "incidente", "incident"], module: "Reportes ciudadanos", change: "Se mejoro la gestion de reportes ciudadanos." },
  { match: ["orbit", "globe", "globo"], module: "ARGUS Orbit", change: "Se ajusto la vista global ARGUS Orbit." },
  { match: ["evento", "event", "fuente", "source", "ingest"], module: "Eventos y fuentes externas", change: "Se actualizaron eventos o fuentes externas." },
  { match: ["seguridad", "security", "acceso", "sesion", "session", "login", "auth"], module: "Acceso y sesion", change: "Se reforzaron validaciones de acceso y sesion." },
  { match: ["vesta"], module: "VESTA", change: "Se actualizo el modulo VESTA de preparacion." },
  { match: ["dashboard"], module: "Dashboard", change: "Se ajusto el panel de control." },
  { match: ["perfil", "profile"], module: "Perfil de usuario", change: "Se ajusto el perfil de usuario." },
  { match: ["notificacion", "notification"], module: "Notificaciones", change: "Se ajustaron las notificaciones del sistema." },
  { match: ["novedad", "changelog", "release", "version"], module: "Actualizaciones publicas", change: "Se actualizo el registro de versiones y novedades." },
];

function readReleaseLog() {
  if (!existsSync(releaseLogPath)) {
    throw new Error(`No existe ${releaseLogPath}`);
  }

  const source = readFileSync(releaseLogPath, "utf8");
  const startIndex = source.indexOf(ARRAY_START);
  if (startIndex === -1) {
    throw new Error("No se encontro el arreglo argusReleaseLog en el archivo fuente.");
  }

  const arrayText = source.slice(startIndex + ARRAY_START.length).trim().replace(/;\s*$/, "");
  const entries = JSON.parse(arrayText);
  const header = source.slice(0, startIndex);

  return { header, entries };
}

function writeReleaseLog(header, entries) {
  const arrayText = JSON.stringify(entries, null, 2);
  const content = `${header}${ARRAY_START}${arrayText};\n`;
  writeFileSync(releaseLogPath, content, "utf8");
}

function parseVersion(version) {
  const match = version.match(/ARGUS V(\d+)\.(\d+)\.(\d+)\.(\d+)/i);
  if (!match) {
    throw new Error(`Version con formato invalido: ${version}`);
  }
  return match.slice(1, 5).map((part) => Number.parseInt(part, 10));
}

function incrementVersion(parts) {
  const next = [...parts];
  let i = next.length - 1;

  while (i >= 0) {
    next[i] += 1;
    if (next[i] > 9 && i > 0) {
      next[i] = 0;
      i -= 1;
    } else {
      break;
    }
  }

  return next;
}

function formatVersion(parts) {
  return `ARGUS V${parts.join(".")}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function detectFromDescription(description) {
  const lower = description.toLowerCase();
  const modules = [];
  const changes = [];

  for (const rule of keywordRules) {
    if (rule.match.some((needle) => lower.includes(needle))) {
      modules.push(rule.module);
      changes.push(rule.change);
    }
  }

  return {
    modules: unique(modules).slice(0, 6),
    changes: unique(changes).slice(0, 6),
  };
}

function toTitleCase(description) {
  const trimmed = description.trim();
  if (!trimmed) {
    return "Actualizacion de ARGUS";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const description = process.argv.slice(2).join(" ").trim();

  if (!description) {
    console.error(
      '[ARGUS release:note] Falta la descripcion. Uso: npm run release:note -- "descripcion del cambio"',
    );
    process.exitCode = 1;
    return;
  }

  const { header, entries } = readReleaseLog();

  if (entries.length === 0) {
    throw new Error("argusReleaseLog.ts no tiene ninguna version base registrada.");
  }

  const latest = entries[0];
  const nextVersionParts = incrementVersion(parseVersion(latest.version));
  const nextVersion = formatVersion(nextVersionParts);
  const nextVersionDotted = nextVersionParts.join(".");

  const { modules, changes } = detectFromDescription(description);
  const affectedModules = modules.length > 0 ? modules : ["ARGUS GRID"];
  const changeList =
    changes.length > 0
      ? changes
      : ["Se realizaron ajustes internos para mejorar estabilidad, interfaz o mantenimiento de ARGUS."];

  const entry = {
    version: nextVersion,
    date: todayIso(),
    title: toTitleCase(description),
    summary: `Se actualizo ARGUS con cambios relacionados a: ${description}.`,
    affectedModules,
    changes: changeList,
    simple: `Esta actualizacion incorpora mejoras relacionadas a: ${description}.`,
  };

  writeReleaseLog(header, [entry, ...entries]);

  const commitMessage = `Argus v${nextVersionDotted}: ${description}`;

  console.log(`[ARGUS release:note] Agregada entrada ${nextVersion} en Novedades.`);
  console.log("[ARGUS release:note] Este script NO ejecuto git add, git commit ni git push.");
  console.log("[ARGUS release:note] Mensaje sugerido de commit:");
  console.log(`  git commit -m "${commitMessage}"`);
}

main();
