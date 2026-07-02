export {};

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const root = process.cwd();
const scanRoots = ["src", "docs", "scripts"];
const skipped = new Set(["node_modules", ".next", ".git"]);
const suspiciousPatterns = [
  [0xC3, 0x83],
  [0xEF, 0xBF, 0xBD],
  [0xC3, 0x82],
  [0xC3, 0xBF],
  [0xE2, 0x80, 0xA6],
  [0x43, 0x72, 0xC3],
  [0x74, 0xC3],
  [0x6D, 0xC3],
].map((codes) => String.fromCharCode(...codes));

const normalizationPatterns = [
  ["normalize", "(\"NFD\")"].join(""),
  ["normalize", "('NFD')"].join(""),
  "replace(/\\p{Diacritic}",
  ["slug", "ify"].join(""),
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    if (skipped.has(entry)) return [];
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return walk(fullPath);
    if (!/\.(ts|tsx|md|json|css)$/.test(entry)) return [];
    return [fullPath];
  });
}

const findings = scanRoots
  .flatMap((scanRoot) => walk(join(root, scanRoot)))
  .flatMap((filePath) => {
    const text = readFileSync(filePath, "utf8");
    return [...suspiciousPatterns, ...normalizationPatterns].flatMap((pattern) => {
      const index = text.indexOf(pattern);
      if (index === -1) return [];
      const line = text.slice(0, index).split(/\r?\n/).length;
      return [{
        file: filePath.replace(`${root}\\`, ""),
        line,
        pattern,
      }];
    });
  });

console.log(JSON.stringify({
  checkedRoots: scanRoots,
  findingCount: findings.length,
  findings,
  note: "Revisar manualmente: algunos patrones pueden ser intencionales en scripts o documentación.",
}, null, 2));
