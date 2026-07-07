import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseLogPath = resolve(root, "src/data/argusReleaseLog.ts");

const ARRAY_START = "export const argusReleaseLog: ArgusReleaseEntry[] = ";

const moduleRules = [
  { match: ["src/components/map", "src/lib/map", "src/app/app"], module: "Mapa operativo" },
  { match: ["GlobeView", "Orbit", "MapToGlobeTransition"], module: "ARGUS Orbit" },
  { match: ["reports", "Report", "Incident", "incidents"], module: "Reportes ciudadanos" },
  { match: ["events", "external-events", "ingest", "ingestion"], module: "Eventos y fuentes externas" },
  { match: ["MapLayerControls", "layers", "Capas", "Layer"], module: "Capas del mapa" },
  { match: ["auth", "login", "register", "session"], module: "Acceso y sesion" },
  { match: ["dashboard"], module: "Dashboard" },
  { match: ["docs"], module: "Documentacion" },
  { match: ["package.json", "package-lock.json"], module: "Dependencias internas" },
  { match: ["src/app/updates", "argusReleaseLog", "prepare-release"], module: "Actualizaciones publicas" },
  { match: ["prisma"], module: "Base de datos interna" },
  { match: ["src/components/mobile", "mobile-safety", "sensor-safety"], module: "Seguridad movil" },
  { match: ["vesta"], module: "VESTA" },
  { match: ["profile", "perfil"], module: "Perfil de usuario" },
  { match: ["legal"], module: "Legal y privacidad" },
];

const changePhrases = [
  { match: ["map", "Map", "Mapa", "layers", "Layer"], text: "Se actualizaron componentes del mapa operativo." },
  { match: ["Globe", "Orbit", "MapToGlobeTransition"], text: "Se ajusto la vista global ARGUS Orbit." },
  { match: ["report", "Report", "incident", "Incident"], text: "Se mejoro la lectura y gestion de reportes." },
  { match: ["event", "Event", "ingest", "source", "Source"], text: "Se actualizaron eventos o fuentes externas." },
  { match: ["vesta", "Vesta"], text: "Se actualizo el modulo VESTA de preparacion." },
  { match: ["css", "page.tsx", "component", "Component"], text: "Se ajustaron vistas y elementos de interfaz." },
  { match: ["docs", ".md"], text: "Se agregaron cambios de documentacion publica o interna." },
  { match: ["package.json", "package-lock.json"], text: "Se actualizaron dependencias o scripts internos." },
  { match: ["auth", "login", "session"], text: "Se ajustaron flujos de acceso y sesion." },
  { match: ["prisma", "migration"], text: "Se actualizo el esquema o las migraciones de base de datos." },
  { match: ["api", "route.ts"], text: "Se actualizaron servicios internos usados por ARGUS." },
];

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function safeGit(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

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

function getChangedFiles() {
  const staged = safeGit(["diff", "--cached", "--name-only"])
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);

  if (staged.length > 0) {
    return { files: staged, source: "staged" };
  }

  const statusLines = safeGit(["status", "--porcelain"])
    .split(/\r?\n/)
    .filter(Boolean);
  const files = statusLines
    .map((line) => normalizePath(line.slice(3).trim()))
    .filter(Boolean);

  return { files, source: "worktree" };
}

function detectModules(files) {
  const modules = [];

  for (const file of files) {
    for (const rule of moduleRules) {
      if (rule.match.some((needle) => file.includes(needle))) {
        modules.push(rule.module);
      }
    }
  }

  return unique(modules).slice(0, 6);
}

function inferChanges(files) {
  const changes = [];

  for (const phrase of changePhrases) {
    if (files.some((file) => phrase.match.some((needle) => file.includes(needle)))) {
      changes.push(phrase.text);
    }
  }

  if (changes.length === 0) {
    changes.push("Se realizaron ajustes internos para mejorar estabilidad, interfaz o mantenimiento de ARGUS.");
  }

  return unique(changes).slice(0, 6);
}

function buildSummary(modules, fileCount, description) {
  if (modules.length === 0) {
    return `Se actualizaron ${fileCount} archivos de ARGUS con ajustes relacionados a: ${description}.`;
  }

  const listedModules = modules.slice(0, 2).join(" y ");
  return `Se actualizaron ${fileCount} archivos relacionados con ${listedModules}.`;
}

function buildSimpleExplanation(modules, description) {
  if (modules.includes("VESTA")) {
    return "Esta actualizacion mejora el modulo VESTA de preparacion familiar ante emergencias.";
  }

  if (modules.includes("Mapa operativo") && modules.includes("ARGUS Orbit")) {
    return "Esta actualizacion mejora la experiencia del mapa y la vista global para que ARGUS sea mas claro al explorar una situacion.";
  }

  if (modules.includes("Reportes ciudadanos")) {
    return "Esta actualizacion ayuda a que los reportes sean mas claros, ordenados y faciles de revisar.";
  }

  if (modules.includes("Acceso y sesion")) {
    return "Esta actualizacion ajusta el acceso a ARGUS para que la experiencia de entrada sea mas consistente.";
  }

  if (modules.includes("Documentacion")) {
    return "Esta actualizacion mejora la informacion disponible sobre ARGUS y sus capacidades.";
  }

  return `Esta actualizacion incorpora mejoras relacionadas a: ${description}.`;
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
      '[ARGUS release] Falta la descripcion. Uso: npm run release:prepare -- "descripcion del cambio"',
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

  const { files } = getChangedFiles();
  const relevantFiles = files.filter((file) => file !== "src/data/argusReleaseLog.ts");

  if (relevantFiles.length === 0) {
    console.log("[ARGUS release] No hay cambios detectados (ni staged ni en el working tree). Nada que preparar.");
    return;
  }

  const modules = detectModules(relevantFiles);
  const affectedModules = modules.length > 0 ? modules : ["ARGUS GRID"];
  const changes = inferChanges(relevantFiles);
  const title = toTitleCase(description);

  const entry = {
    version: nextVersion,
    date: todayIso(),
    title,
    summary: buildSummary(affectedModules, relevantFiles.length, description),
    affectedModules,
    changes,
    simple: buildSimpleExplanation(affectedModules, description),
  };

  writeReleaseLog(header, [entry, ...entries]);

  const filesToAdd = unique([...relevantFiles, "src/data/argusReleaseLog.ts"]);
  git(["add", ...filesToAdd]);

  const commitMessage = `Argus v${nextVersionDotted}: ${description}`;
  git(["commit", "-m", commitMessage]);

  console.log(`[ARGUS release] Version preparada: ${nextVersion}`);
  console.log(`[ARGUS release] Commit creado: "${commitMessage}"`);
  console.log("[ARGUS release] No se hizo push. Cuando quieras publicar, ejecuta: git push origin <rama>");
}

main();
