import { createHash } from "crypto";

export function generateGovernmentIdHash(governmentId: string) {
  const normalized = governmentId.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export function formatPublicAlias(name: string) {
  const label = name.trim().split(" ").slice(0, 2).join(" ");
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${label}#${suffix}`;
}
