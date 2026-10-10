#!/usr/bin/env node
// Rebuilds data/live.json from the World Bank's open API.
//   node scripts/refresh.mjs                 fetch live data (used by the monthly workflow)
//   node scripts/refresh.mjs --seed FILE     rebuild from a saved snapshot, no network
// If anything looks wrong the script exits with an error and leaves live.json alone.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeRows, validate, serialize } from "./lib/normalize.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.worldbank.org/v2/";
const OUT = path.join(root, "data", "live.json");

async function getJson(pathAndQuery) {
  const res = await fetch(API + pathAndQuery, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`World Bank request failed (${res.status}): ${pathAndQuery}`);
  return res.json();
}

async function fetchRows() {
  const [countries, pops, areas] = await Promise.all([
    getJson("country?format=json&per_page=400"),
    getJson("country/all/indicator/SP.POP.TOTL?format=json&per_page=20000&mrnev=1"),
    getJson("country/all/indicator/AG.SRF.TOTL.K2?format=json&per_page=20000&mrnev=1"),
  ]);
  const pop = new Map();
  const year = new Map();
  for (const x of pops[1] || []) {
    if (x.value != null) { pop.set(x.countryiso3code, x.value); year.set(x.countryiso3code, x.date); }
  }
  const area = new Map();
  for (const x of areas[1] || []) if (x.value != null) area.set(x.countryiso3code, Math.round(x.value));
  const rows = [];
  for (const c of countries[1] || []) {
    if (!c.region || c.region.value === "Aggregates") continue;
    rows.push([
      c.name, c.id, c.capitalCity || "", pop.get(c.id) || 0, area.get(c.id) || 0,
      c.region.value, c.incomeLevel ? c.incomeLevel.value : "", year.get(c.id) || "",
    ]);
  }
  return { rows, fetchedAt: new Date().toISOString(), source: "World Bank Open Data" };
}

async function main() {
  const seedFlag = process.argv.indexOf("--seed");
  const snapshot = seedFlag > -1
    ? JSON.parse(await readFile(process.argv[seedFlag + 1], "utf8"))
    : await fetchRows();

  const aliases = JSON.parse(await readFile(path.join(root, "data", "aliases.json"), "utf8"));
  const extras = JSON.parse(await readFile(path.join(root, "data", "extra-countries.json"), "utf8")).countries;
  const countries = normalizeRows(snapshot.rows, aliases, extras);

  const problems = validate(countries);
  if (problems.length) {
    console.error("Refusing to write live.json:\n - " + problems.join("\n - "));
    process.exit(1);
  }

  const years = countries.map((c) => Number(c.year)).filter(Boolean).sort((a, b) => a - b);
  const meta = {
    generatedAt: snapshot.fetchedAt,
    source: snapshot.source,
    populationYear: years.length ? years[Math.floor(years.length / 2)] : null,
    count: countries.length,
  };
  await writeFile(OUT, serialize(meta, countries));
  console.log(`Wrote ${countries.length} countries to data/live.json (${meta.generatedAt}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
