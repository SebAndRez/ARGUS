import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string, override = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key] || override) process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), ".env"));
loadEnvFile(join(process.cwd(), ".env.local"), true);

const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean);
const unsafePatterns = [
  "supabase.co",
  "pooler.supabase.com",
  "vercel",
  "postgresql://",
  "postgres://",
  "mysql://",
];

const isExplicitLocal = urls.every((url) => {
  if (!url) return true;
  const normalized = url.toLowerCase();
  return (
    normalized.startsWith("file:") ||
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1")
  );
});

const looksRemote = urls.some((url) =>
  unsafePatterns.some((pattern) => url?.toLowerCase().includes(pattern))
);

if (!isExplicitLocal || looksRemote) {
  console.error(
    "Bloqueado: este comando local peligroso solo puede ejecutarse contra SQLite/local/localhost. No se imprimen URLs."
  );
  process.exit(1);
}

console.log("DB local verificada. Continuando comando peligroso local.");
