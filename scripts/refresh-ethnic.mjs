// Monthly: for peoples that are not one country (Kurds, Maya, Māori...), ask Wikidata (CC0) for population, languages and famous people.
// Reads data/ethnic-groups.json, writes data/ethnic.json. A group with nothing useful is left out. Old values are kept if Wikidata is unreachable.
import { readFile, writeFile } from "node:fs/promises";
import { chooseFamous } from "./lib/famous.mjs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const readJson = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(q) {
  for (let a = 1; a <= 3; a++) {
    try {
      const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60000) });
      if (res.ok) return (await res.json()).results.bindings;
      if (res.status !== 429 && res.status < 500) throw new Error("HTTP " + res.status);
    } catch (e) { if (a === 3) throw e; }
    await sleep(a * 6000);
  }
}
const esc = (s) => s.replace(/["\\]/g, "");

async function one(g, rules) {
  const label = esc(g.label || g.n);
  const found = await sparql(`SELECT ?e ?sl WHERE { ?e rdfs:label "${label}"@en; wdt:P31/wdt:P279* wd:Q41710; wikibase:sitelinks ?sl } ORDER BY DESC(?sl) LIMIT 1`);
  if (!found.length) return null;
  const qid = found[0].e.value.split("/").pop();
  const pop = await sparql(`SELECT ?v WHERE { wd:${qid} p:P1082 ?s. ?s ps:P1082 ?v. OPTIONAL { ?s pq:P585 ?t } } ORDER BY DESC(?t) LIMIT 1`);
  const langs = await sparql(`SELECT ?lLabel WHERE { wd:${qid} wdt:P2936 ?l. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 5`);
  const rows = await sparql(`SELECT ?pLabel ?pDescription ?sl WHERE { ?p wdt:P172 wd:${qid}; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. FILTER(?sl>12) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 60`);
  const famous = chooseFamous(rows.map((r) => [r.pLabel?.value || "", r.pDescription?.value || "", Number(r.sl.value)]), rules, g.id);
  const population = pop.length ? Math.round(Number(pop[0].v.value)) : 0;
  if (!population && famous.length < 3) return null;
  return { id: g.id, n: g.n, aka: g.aka || [], qid, population, languages: langs.map((r) => r.lLabel.value).filter((x) => !/^Q\d+$/.test(x)), famous };
}

const list = (await readJson("../data/ethnic-groups.json")).groups;
const rules = await readJson("../data/famous-rules.json");
const prev = await readJson("../data/ethnic.json").catch(() => ({ groups: {} }));
const groups = {};
let failed = 0;
for (const g of list) {
  try {
    const r = await one(g, rules);
    if (r) groups[g.id] = r; else console.warn(`${g.n}: not enough in Wikidata, left out`);
  } catch (e) {
    failed++; console.warn(`${g.n}: ${e.message} (keeping previous)`);
    if (prev.groups?.[g.id]) groups[g.id] = prev.groups[g.id];
  }
  await sleep(800);
}
if (failed > list.length * 0.5) { console.error("Too many failed. Not writing."); process.exit(1); }
await writeFile(new URL("../data/ethnic.json", import.meta.url), JSON.stringify({ meta: { generatedAt: new Date().toISOString(), source: "Wikidata (CC0)", count: Object.keys(groups).length }, groups }, null, 1) + "\n");
console.log(`Wrote ${Object.keys(groups).length} peoples (${failed} failed).`);
