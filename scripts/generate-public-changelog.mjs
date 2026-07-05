import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdownPath = resolve(root, "docs/PUBLIC_CHANGELOG.md");
const jsonPath = resolve(root, "src/data/publicChangelog.json");
const generatedPaths = new Set([
  "docs/PUBLIC_CHANGELOG.md",
  "src/data/publicChangelog.json",
]);

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
  { match: ["src/app/updates", "publicChangelog", "generate-public-changelog"], module: "Actualizaciones publicas" },
  { match: ["prisma"], module: "Base de datos interna" },
  { match: ["src/components/mobile", "mobile-safety", "sensor-safety"], module: "Seguridad movil" },
  { match: ["profile", "perfil"], module: "Perfil de usuario" },
  { match: ["legal"], module: "Legal y privacidad" },
];

const changePhrases = [
  { match: ["map", "Map", "Mapa", "layers", "Layer"], text: "Se actualizaron componentes del mapa operativo." },
  { match: ["Globe", "Orbit", "MapToGlobeTransition"], text: "Se ajusto la vista global ARGUS Orbit." },
  { match: ["report", "Report", "incident", "Incident"], text: "Se mejoro la lectura y gestion de reportes." },
  { match: ["event", "Event", "ingest", "source", "Source"], text: "Se actualizaron eventos o fuentes externas." },
  { match: ["css", "page.tsx", "component", "Component"], text: "Se ajustaron vistas y elementos de interfaz." },
  { match: ["docs", ".md"], text: "Se agregaron cambios de documentacion publica o interna." },
  { match: ["package.json", "package-lock.json"], text: "Se actualizaron dependencias o scripts internos." },
  { match: ["auth", "login", "session"], text: "Se ajustaron flujos de acceso y sesion." },
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

function readJsonEntries() {
  if (!existsSync(jsonPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

  return unique(changes).slice(0, 5);
}

function buildSummary(modules, fileCount) {
  if (modules.length === 0) {
    return `Se actualizaron ${fileCount} archivos de ARGUS con ajustes internos de estabilidad, interfaz o mantenimiento.`;
  }

  const listedModules = modules.slice(0, 2).join(" y ");
  return `Se actualizaron ${fileCount} archivos relacionados con ${listedModules}.`;
}

function buildSimpleExplanation(modules) {
  if (modules.includes("Mapa operativo") && modules.includes("ARGUS Orbit")) {
    return "Esta actualizacion mejora la experiencia del mapa y la vista global para que ARGUS sea mas claro al explorar una situacion.";
  }

  if (modules.includes("Actualizaciones publicas")) {
    return "Esta actualizacion permite que ARGUS publique un registro claro de cambios para que los usuarios entiendan que se modifico.";
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

  return "Esta actualizacion incorpora mejoras de mantenimiento para que ARGUS siga evolucionando de forma ordenada.";
}

function getCommitTitle() {
  const messageFile =
    process.argv[2] ||
    process.env.HUSKY_GIT_PARAMS ||
    process.env.GIT_COMMIT_MESSAGE_FILE;
  if (messageFile && existsSync(messageFile)) {
    const firstLine = readFileSync(messageFile, "utf8")
      .split(/\r?\n/)
      .find((line) => line.trim() && !line.trim().startsWith("#"));
    if (firstLine) {
      return firstLine.trim();
    }
  }

  return "Actualizacion en preparacion";
}

function formatMarkdown(entries) {
  if (entries.length === 0) {
    return "# ARGUS Public Changelog\n\nTodavia no hay actualizaciones publicas registradas.\n";
  }

  const blocks = entries.map((entry) => {
    const changes = entry.changes.map((change) => `- ${change}`).join("\n");
    const modules = entry.affectedModules.map((module) => `- ${module}`).join("\n");

    return [
      `## ${entry.date} - ${entry.commit} - ${entry.title}`,
      "",
      `**Archivos modificados:** ${entry.fileCount}`,
      "",
      "**Resumen publico:**  ",
      entry.summary,
      "",
      "**Cambios principales:**",
      changes,
      "",
      "**Modulos afectados:**",
      modules,
      "",
      "**En simple:**  ",
      entry.simpleExplanation,
    ].join("\n");
  });

  return `# ARGUS Public Changelog\n\n${blocks.join("\n\n---\n\n")}\n`;
}

function main() {
  const stagedFiles = safeGit(["diff", "--cached", "--name-only"])
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
  const relevantFiles = stagedFiles.filter((file) => !generatedPaths.has(file));

  if (relevantFiles.length === 0) {
    console.log("[ARGUS changelog] No staged changes detected.");
    return;
  }

  const diffStat = safeGit(["diff", "--cached", "--stat", "--", ...relevantFiles]);
  const diffNumstat = safeGit(["diff", "--cached", "--numstat", "--", ...relevantFiles]);
  const date = new Date().toISOString().slice(0, 10);
  const title = getCommitTitle();
  const changeId = createHash("sha256")
    .update([date, title, relevantFiles.join("\n"), diffStat, diffNumstat].join("\n---\n"))
    .digest("hex")
    .slice(0, 12);
  const modules = detectModules(relevantFiles);
  const affectedModules = modules.length > 0 ? modules : ["ARGUS GRID"];
  const changes = inferChanges(relevantFiles);
  const entry = {
    changeId,
    date,
    commit: `pending-${changeId.slice(0, 7)}`,
    title,
    fileCount: relevantFiles.length,
    summary: buildSummary(affectedModules, relevantFiles.length),
    changes,
    affectedModules,
    simpleExplanation: buildSimpleExplanation(affectedModules),
  };

  const entries = readJsonEntries();
  const nextEntries = [entry, ...entries.filter((item) => item.changeId !== changeId)];

  mkdirSync(dirname(markdownPath), { recursive: true });
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, formatMarkdown(nextEntries), "utf8");
  safeGit(["add", "docs/PUBLIC_CHANGELOG.md", "src/data/publicChangelog.json"]);
  console.log("[ARGUS changelog] Public changelog updated.");
}

try {
  main();
} catch (error) {
  console.warn(`[ARGUS changelog] Warning: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 0;
}
