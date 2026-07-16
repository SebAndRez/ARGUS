import { loadLocalEnvFiles } from "./lib/databaseSafety";

loadLocalEnvFiles();

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
