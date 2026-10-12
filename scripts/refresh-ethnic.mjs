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
  const labels = [].concat(g.label || g.n).map((l) => `"${esc(l)}"@en`).join(" ");
  const found = await sparql(`SELECT ?e ?sl WHERE { VALUES ?lab { ${labels} } ?e rdfs:label ?lab; wdt:P31/wdt:P279* wd:Q41710; wikibase:sitelinks ?sl } ORDER BY DESC(?sl) LIMIT 1`);
  if (!found.length) return null;
  const qid = found[0].e.value.split("/").pop();
  // Worldwide figure: the largest population statement that does not name a country (a smaller one is usually a census of a single place).
  const pop = await sparql(`SELECT ?v WHERE { wd:${qid} p:P1082 ?s. ?s ps:P1082 ?v. FILTER NOT EXISTS { ?s pq:P1001 [] } } ORDER BY DESC(?v) LIMIT 1`);
  const langs = await sparql(`SELECT ?lLabel WHERE { wd:${qid} wdt:P2936 ?l. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 5`);
  const desc = await sparql(`SELECT ?d WHERE { wd:${qid} schema:description ?d. FILTER(lang(?d)="en") } LIMIT 1`);
  // Population by country: Wikidata keeps these as population statements that name a country.
  const byCountry = await sparql(`SELECT ?jLabel ?v ?t WHERE { wd:${qid} p:P1082 ?s. ?s ps:P1082 ?v; pq:P1001 ?j. OPTIONAL { ?s pq:P585 ?t } ?j wdt:P31/wdt:P279* wd:Q6256. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 300`);
  const latest = {};
  for (const r of byCountry) {
    const n = r.jLabel?.value; if (!n || /^Q\d+$/.test(n)) continue;
    const t = r.t?.value || "", v = Math.round(Number(r.v.value));
    if (!latest[n] || t > latest[n].t) latest[n] = { t, v };
  }
  let where = Object.entries(latest).map(([name, o]) => ({ name, pop: o.v })).filter((w) => w.pop >= 10000).sort((a, b) => b.pop - a.pop).slice(0, 5);
  if (!where.length) {
    const origin = await sparql(`SELECT ?cLabel WHERE { wd:${qid} wdt:P495 ?c. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 4`);
    where = origin.map((r) => ({ name: r.cLabel.value, pop: 0 })).filter((w) => !/^Q\d+$/.test(w.name));
  }
  const rows = await sparql(`SELECT ?pLabel ?pDescription ?sl WHERE { ?p wdt:P172 wd:${qid}; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. FILTER(?sl>4) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 150`);
  const famous = chooseFamous(rows.map((r) => [r.pLabel?.value || "", r.pDescription?.value || "", Number(r.sl.value)]), rules, g.id);
  let population = pop.length ? Math.round(Number(pop[0].v.value)) : 0;
  // No worldwide figure: add up the newest figure for each country (a floor, shown with "about").
  if (population < 100000) population = Object.values(latest).reduce((sum, o) => sum + o.v, 0);
  if (population < 100000) population = 0; // tiny numbers in Wikidata are usually a counting mistake or a small sub-count
  if (famous.length < 3) return null; // a people page needs famous people to be worth opening
  const about = desc[0]?.d.value || "";
  return { id: g.id, n: g.n, aka: g.aka || [], qid, about: about.length >= 15 && !/^ethnic group$/i.test(about) && !(rules.blockWords || []).some((w) => about.toLowerCase().includes(w)) ? about : "", where, population, languages: langs.map((r) => r.lLabel.value).filter((x) => !/^Q\d+$/.test(x)), famous };
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
