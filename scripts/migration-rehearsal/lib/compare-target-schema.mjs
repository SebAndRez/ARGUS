#!/usr/bin/env node
/**
 * scripts/migration-rehearsal/lib/compare-target-schema.mjs
 *
 * Structural gate between what the target migrations ACTUALLY create
 * (a live catalog captured with sql/target-schema-catalog.sql after waves
 * 000-100) and prisma/schema.target.prisma. Before this existed the rehearsal
 * was green while waves 010-090 diverged from the Prisma model in ~500 places
 * (Paso 2 audit): nothing ever compared the two.
 *
 * Compares, per table (mapped to the wave whose migration.sql creates it):
 * tables, columns, nullability, enum-typed columns, enum value sets, and
 * foreign keys by (columns, target table, ON DELETE) — deliberately ignoring
 * constraint/index NAMES and ON UPDATE, which are naming noise between
 * hand-written SQL and Prisma. Views are listed as VIEW_NOT_MODELED (Prisma
 * 4.16 cannot model them); the D-02 provenance mixin columns that exist only
 * in SQL are listed as D02_MIXIN_ONLY_IN_SQL, separately from real drift.
 *
 * Output is a deterministic, sorted inventory. It is compared against the
 * committed baseline (target-schema-drift-baseline.json) and the gate fails on
 * ANY difference: a new divergence cannot slip in, and a resolved one must be
 * removed from the baseline explicitly (the baseline only ever shrinks by a
 * reviewed change). It starts as a known-divergence inventory, not a claim
 * that the divergences are acceptable.
 *
 * Usage:
 *   node compare-target-schema.mjs --catalog <catalog.json> --out <inventory.json>
 *        [--baseline <baseline.json>] [--write-baseline] [--repo <root>]
 * Exit: 0 = inventory equals baseline; 1 = differs; 2 = usage/input error.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const repo = resolve(opt("--repo") ?? join(here, "..", "..", ".."));
const catalogPath = opt("--catalog");
const outPath = opt("--out");
const baselinePath = opt("--baseline") ?? join(here, "..", "target-schema-drift-baseline.json");
const writeBaseline = args.includes("--write-baseline");
if (!catalogPath || !outPath) {
  console.error("Usage: compare-target-schema.mjs --catalog <catalog.json> --out <inventory.json> [--baseline <file>] [--write-baseline]");
  process.exit(2);
}

const catalogText = readFileSync(catalogPath, "utf8").replace(/^﻿/, "");
const jsonLine = catalogText.split(/\r?\n/).find((line) => line.trim().startsWith("{"));
if (!jsonLine) {
  console.error(`TARGET_SCHEMA_CATALOG_UNREADABLE - no JSON object in ${catalogPath}`);
  process.exit(2);
}
const cat = JSON.parse(jsonLine);
const prisma = readFileSync(join(repo, "prisma", "schema.target.prisma"), "utf8");

// ---------- object -> wave (first migration.sql that creates it) ----------
const wavesDir = join(repo, "prisma", "target-migrations");
const waveOf = new Map();
const enumWave = new Map();
for (const w of readdirSync(wavesDir).sort()) {
  const file = join(wavesDir, w, "migration.sql");
  if (!existsSync(file)) continue;
  const sql = readFileSync(file, "utf8");
  for (const m of sql.matchAll(/CREATE\s+(?:TABLE|(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\."?(\w+)"?/gi)) {
    const key = `${m[1]}.${m[2]}`;
    if (!waveOf.has(key)) waveOf.set(key, w.slice(0, 3));
  }
  for (const m of sql.matchAll(/CREATE\s+TYPE\s+"?(\w+)"?\."?(\w+)"?\s+AS\s+ENUM/gi)) {
    const key = `${m[1]}.${m[2]}`;
    if (!enumWave.has(key)) enumWave.set(key, w.slice(0, 3));
  }
}
// Views created in backfill.sql (the per-schema review queues).
for (const w of readdirSync(wavesDir).sort()) {
  const file = join(wavesDir, w, "backfill.sql");
  if (!existsSync(file)) continue;
  for (const m of readFileSync(file, "utf8").matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+"?(\w+)"?\."?(\w+)"?/gi)) {
    const key = `${m[1]}.${m[2]}`;
    if (!waveOf.has(key)) waveOf.set(key, w.slice(0, 3));
  }
}

// ---------- parse schema.target.prisma ----------
const enums = new Map();
const models = new Map();
for (const [, kind, name, body] of prisma.matchAll(/^(model|enum|view)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const schema = (body.match(/@@schema\("(\w+)"\)/) || [])[1];
  const mapped = (body.match(/@@map\("(\w+)"\)/) || [])[1] || name;
  if (kind === "enum") {
    const values = [];
    for (const line of body.split("\n")) {
      const l = line.replace(/\/\/.*$/, "").trim();
      if (!l || l.startsWith("@@")) continue;
      const v = l.match(/^(\w+)(?:\s+@map\("([^"]+)"\))?/);
      if (v) values.push(v[2] || v[1]);
    }
    enums.set(name, { schema, db: mapped, values });
  } else {
    models.set(name, { schema, table: mapped, body });
  }
}
for (const m of models.values()) {
  m.fields = [];
  for (const line of m.body.split("\n")) {
    const l = line.replace(/\/\/.*$/, "").trim();
    if (!l || l.startsWith("@@")) continue;
    const f = l.match(/^(\w+)\s+(Unsupported\("[^"]*"\)|\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!f) continue;
    const [, fname, ftype, list, opt2, attrs] = f;
    const col = (attrs.match(/@map\("([^"]+)"\)/) || [])[1] || fname;
    if (models.has(ftype)) {
      const rel = attrs.match(/@relation\(([^)]*(?:\([^)]*\)[^)]*)*)\)/);
      if (rel && /fields:\s*\[/.test(rel[1])) {
        const fields = rel[1].match(/fields:\s*\[([^\]]*)\]/)[1].split(",").map((s) => s.trim());
        const onDelete = (rel[1].match(/onDelete:\s*(\w+)/) || [])[1];
        m.fields.push({ relation: true, fields, target: ftype, onDelete, optional: !!opt2 });
      }
      continue;
    }
    m.fields.push({ name: fname, col, type: ftype, list: !!list, optional: !!opt2 });
  }
  const colOf = new Map(m.fields.filter((x) => !x.relation).map((x) => [x.name, x.col]));
  for (const r of m.fields.filter((x) => x.relation)) r.cols = r.fields.map((n) => colOf.get(n) || n);
}

// ---------- index the live catalog ----------
const dbTables = new Map((cat.tables || []).map((t) => [`${t.s}.${t.t}`, t.k]));
const dbCols = new Map();
for (const c of cat.columns || []) {
  const k = `${c.s}.${c.t}`;
  if (!dbCols.has(k)) dbCols.set(k, new Map());
  dbCols.get(k).set(c.c, c);
}
const dbEnums = new Map((cat.enums || []).map((e) => [`${e.s}.${e.e}`, e.v || []]));
const dbFks = new Map((cat.fks || []).map((f) => [`${f.s}.${f.t}(${[...f.cols].sort().join(",")})`, f]));

const scalarUdt = {
  String: ["text", "varchar", "bpchar", "citext", "uuid", "inet", "cidr"],
  Int: ["int4", "int2"], BigInt: ["int8"], Float: ["float8", "float4"], Decimal: ["numeric"],
  Boolean: ["bool"], DateTime: ["timestamptz", "timestamp", "date", "time", "timetz"],
  Json: ["jsonb", "json"], Bytes: ["bytea"],
};
const delCode = { Restrict: "r", NoAction: "a", Cascade: "c", SetNull: "n", SetDefault: "d" };
const delName = { r: "RESTRICT", a: "NO_ACTION", c: "CASCADE", n: "SET_NULL", d: "SET_DEFAULT" };
const D02_MIXIN = new Set(["legacy_status", "legacy_source", "legacy_record_id", "migration_confidence", "migration_review_status"]);

const issues = [];
const add = (wave, object, kind, detail) => issues.push(`${wave || "???"}|${kind}|${object}|${detail}`);
const seen = new Set();

for (const [pname, m] of models) {
  const key = `${m.schema}.${m.table}`;
  seen.add(key);
  const wave = waveOf.get(key);
  if (!dbTables.has(key)) { add(wave, key, "TABLE_MISSING_IN_DB", `model ${pname}`); continue; }
  const cols = dbCols.get(key) || new Map();
  const prismaCols = new Set();
  for (const f of m.fields.filter((x) => !x.relation)) {
    prismaCols.add(f.col);
    const c = cols.get(f.col);
    if (!c) { add(wave, key, "COLUMN_MISSING_IN_DB", `${f.col} (${f.type}${f.list ? "[]" : ""}${f.optional ? "?" : ""})`); continue; }
    if (c.null !== f.optional && !f.list) add(wave, key, "NULLABILITY", `${f.col}: prisma ${f.optional ? "NULL" : "NOT NULL"} vs db ${c.null ? "NULL" : "NOT NULL"}`);
    const udt = c.udt.split(".")[1].replace(/^_/, "");
    if (enums.has(f.type)) {
      const e = enums.get(f.type);
      if (c.udt.replace(/\._/, ".") !== `${e.schema}.${e.db}`) add(wave, key, "TYPE", `${f.col}: prisma enum ${e.schema}.${e.db} vs db ${c.udt}`);
    } else if (scalarUdt[f.type] && !scalarUdt[f.type].includes(udt)) {
      add(wave, key, "TYPE", `${f.col}: prisma ${f.type} vs db ${c.udt}`);
    }
  }
  for (const col of [...cols.keys()].sort()) {
    if (prismaCols.has(col)) continue;
    add(wave, key, D02_MIXIN.has(col) ? "D02_MIXIN_ONLY_IN_SQL" : "COLUMN_EXTRA_IN_DB", col);
  }
  for (const r of m.fields.filter((x) => x.relation)) {
    const t = models.get(r.target);
    const fk = dbFks.get(`${key}(${[...r.cols].sort().join(",")})`);
    if (!fk) { add(wave, key, "FK_MISSING_IN_DB", `(${r.cols}) -> ${t.schema}.${t.table}`); continue; }
    if (`${fk.rs}.${fk.rt}` !== `${t.schema}.${t.table}`) add(wave, key, "FK_TARGET", `(${r.cols}) prisma -> ${t.schema}.${t.table} vs db -> ${fk.rs}.${fk.rt}`);
    const want = r.onDelete ? delCode[r.onDelete] : (r.optional ? "n" : "r");
    const same = want === fk.del || (["r", "a"].includes(want) && ["r", "a"].includes(fk.del));
    if (!same) add(wave, key, "FK_ON_DELETE", `(${r.cols}) prisma ${delName[want]}${r.onDelete ? "" : " (default)"} vs db ${delName[fk.del]}`);
  }
}
for (const [key, kind] of dbTables) {
  if (seen.has(key)) continue;
  add(waveOf.get(key), key, kind === "v" || kind === "m" ? "VIEW_NOT_MODELED" : "TABLE_EXTRA_IN_DB", kind);
}
for (const [pname, e] of enums) {
  const key = `${e.schema}.${e.db}`;
  const db = dbEnums.get(key);
  if (!db) { add(enumWave.get(key), key, "ENUM_MISSING_IN_DB", pname); continue; }
  const missing = e.values.filter((v) => !db.includes(v));
  const extra = db.filter((v) => !e.values.includes(v));
  if (missing.length || extra.length) add(enumWave.get(key), key, "ENUM_VALUES", `prisma-only [${missing}] db-only [${extra}]`);
}
const prismaEnumKeys = new Set([...enums.values()].map((e) => `${e.schema}.${e.db}`));
for (const key of dbEnums.keys()) if (!prismaEnumKeys.has(key)) add(enumWave.get(key), key, "ENUM_EXTRA_IN_DB", "");

issues.sort();
const inventory = { schema: "prisma/schema.target.prisma", comparedAgainst: "waves 000-100 applied on the realistic legacy baseline", issues };
writeFileSync(outPath, JSON.stringify(inventory, null, 1) + "\n");

// ---------- summary ----------
const REAL = (i) => !/\|(VIEW_NOT_MODELED|D02_MIXIN_ONLY_IN_SQL)\|/.test(i);
const byWave = {};
for (const i of issues) {
  const w = i.split("|")[0];
  byWave[w] ??= { structural: 0, mixin: 0, views: 0 };
  if (i.includes("|VIEW_NOT_MODELED|")) byWave[w].views++;
  else if (i.includes("|D02_MIXIN_ONLY_IN_SQL|")) byWave[w].mixin++;
  else byWave[w].structural++;
}
for (const w of Object.keys(byWave).sort()) {
  const b = byWave[w];
  console.log(`TARGET_SCHEMA_DRIFT|wave=${w}|structural=${b.structural}|d02_mixin_only_in_sql=${b.mixin}|views_not_modeled=${b.views}`);
}
console.log(`TARGET_SCHEMA_DRIFT_TOTAL|structural=${issues.filter(REAL).length}|all=${issues.length}`);

// ---------- Paso 5 classification ----------
// Every entry lands in exactly one of the four buckets Paso 5 requires, by
// rule (classify-target-schema-drift.mjs), never by hand. The last line is the
// one that matters operationally: real drift about a column the shadow-write
// writes or the dual-read compares. Those are the entries whose reconciliation
// WILL touch the sync path, so they are named individually here and ratcheted
// by tests/database-target/paso5-drift-classification.test.ts.
const { classifyAll } = await import("./classify-target-schema-drift.mjs");
const classification = classifyAll(issues);
for (const cls of Object.keys(classification.counts).sort()) {
  console.log(`TARGET_SCHEMA_DRIFT_CLASS|${cls}|${classification.counts[cls]}`);
}
for (const entry of classification.shadowDependent) {
  console.log(`TARGET_SCHEMA_DRIFT_SHADOW_DEPENDENT|${entry.wave}|${entry.kind}|${entry.object}|${entry.column}`);
}
console.log(
  `TARGET_SCHEMA_DRIFT_SHADOW_DEPENDENT_TOTAL|${classification.shadowDependent.length}` +
    `|on_shadow_tables=${classification.onShadowSurface.length}`
);

if (writeBaseline) {
  writeFileSync(baselinePath, JSON.stringify(inventory, null, 1) + "\n");
  console.log(`TARGET_SCHEMA_DRIFT_BASELINE_WRITTEN ${baselinePath}`);
  process.exit(0);
}
if (!existsSync(baselinePath)) {
  console.error(`TARGET_SCHEMA_DRIFT_FAIL - no baseline at ${baselinePath}; generate it with --write-baseline after review.`);
  process.exit(1);
}
const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8").replace(/^﻿/, "")).issues);
const current = new Set(issues);
const added = issues.filter((i) => !baseline.has(i));
const resolved = [...baseline].filter((i) => !current.has(i)).sort();
if (added.length === 0 && resolved.length === 0) {
  console.log(`TARGET_SCHEMA_DRIFT_MATCHES_BASELINE (${issues.length} known entries)`);
  process.exit(0);
}
for (const i of added) console.error(`NEW      ${i}`);
for (const i of resolved) console.error(`RESOLVED ${i}   (remove it from the baseline in the same change)`);
console.error(`TARGET_SCHEMA_DRIFT_FAIL - ${added.length} new, ${resolved.length} resolved-but-still-in-baseline. The baseline must equal reality.`);
process.exit(1);
