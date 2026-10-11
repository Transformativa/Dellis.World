// Monthly: UNESCO World Heritage Sites for every country, from Wikidata (CC0).
// Writes data/heritage.json: { CODE: { count (not shown, can include parts of sites), examples: [3 names] } }. Names that are not kid friendly or too long are skipped as examples.
import { readFile, writeFile } from "node:fs/promises";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const readJson = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOT_FOR_KIDS = /(auschwitz|concentration|genocide|massacre|memorial|hiroshima|nagasaki|robben|slave|prison|execution|battlefield|war |wars|cemetery|burial|tomb of)/i;
const DEADLINE = Date.now() + 60 * 60 * 1000;

async function sparql(q) {
  for (let a = 1; a <= 2; a++) {
    try {
      const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(45000) });
      if (res.ok) return (await res.json()).results.bindings;
      if (res.status !== 429 && res.status < 500) throw new Error("HTTP " + res.status);
    } catch (e) { if (a === 2) throw e; }
    await sleep(8000);
  }
}

const live = await readJson("../data/live.json");
const prev = await readJson("../data/heritage.json").catch(() => ({ countries: {} }));
const ids = await sparql("SELECT ?iso ?c WHERE { ?c wdt:P298 ?iso }");
const qid = Object.fromEntries(ids.map((r) => [r.iso.value, r.c.value.split("/").pop()]));
const queue = live.countries.map((c) => c.code).filter((c) => qid[c]);
const countries = {};
let failed = 0;
const worker = async () => {
  while (queue.length) {
    const code = queue.shift();
    if (Date.now() > DEADLINE) { if (prev.countries?.[code]) countries[code] = prev.countries[code]; continue; }
    try {
      const rows = await sparql(`SELECT ?sLabel ?sl WHERE { ?s wdt:P1435 wd:Q9259; wdt:P17 wd:${qid[code]}; wikibase:sitelinks ?sl. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl) LIMIT 100`);
      if (!rows.length) continue;
      const examples = rows.map((r) => r.sLabel.value).filter((n) => !/^Q\d+$/.test(n) && n.length <= 45 && !NOT_FOR_KIDS.test(n)).slice(0, 3);
      countries[code] = { count: rows.length, examples };
    } catch (e) {
      failed++; console.warn(`${code}: ${e.message} (keeping previous)`);
      if (prev.countries?.[code]) countries[code] = prev.countries[code];
    }
    await sleep(400);
  }
};
await Promise.all(Array.from({ length: 3 }, worker));
if (failed > 60) { console.error("Too many failed. Not writing."); process.exit(1); }
await writeFile(new URL("../data/heritage.json", import.meta.url), JSON.stringify({ meta: { generatedAt: new Date().toISOString(), source: "Wikidata (CC0), UNESCO World Heritage list", count: Object.keys(countries).length }, countries }, null, 1) + "\n");
console.log(`Wrote heritage for ${Object.keys(countries).length} countries (${failed} failed).`);
