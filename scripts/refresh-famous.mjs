// Monthly: for every country, find the best-known people from Wikidata (CC0).
// A person counts for a country only if they are a citizen AND were born there.
// Small and mid countries: one query. Big countries (query times out): one short query per job (writer, painter...), merged.
// A country that cannot be finished keeps its previous list. A global deadline stops the run in time.
// Usage: node scripts/refresh-famous.mjs            fetch from Wikidata
//        node scripts/refresh-famous.mjs --seed F   build from a saved { CODE: [[name, desc, sitelinks], ...] } file
import { readFile, writeFile } from "node:fs/promises";
import { chooseFamous } from "./lib/famous.mjs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const THRESHOLDS = [120, 50, 20, 8, 2];
const OCCUPATIONS = ["Q36180","Q1028181","Q169470","Q36834","Q177220","Q49757","Q205375","Q11631","Q11900058","Q3665646","Q937857","Q170790","Q593644","Q33999","Q4964182","Q483501","Q901","Q42973","Q2526255","Q11063","Q10833314","Q6625963","Q39631","Q81096","Q2066131","Q639669","Q214917"];
const CONCURRENCY = 4;
const DEADLINE = Date.now() + 85 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
class Timeout extends Error {}

async function sparql(query) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) { throw new Timeout(e.message); }
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 2) throw new Timeout(`HTTP ${res.status}`);
      await sleep((Number(res.headers.get("retry-after")) || 8) * 1000);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}
const toRows = (rows) => rows.map((r) => [r.pLabel?.value || "", r.pDescription?.value || "", Number(r.sl.value)]);
const born = (c) => `?p wdt:P27 ${c}; wdt:P31 wd:Q5; wdt:P19/wdt:P17 ${c}; wikibase:sitelinks ?sl.`;
const LABEL = `SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }`;

async function oneQuery(ids) {
  const c = "?c";
  const vals = ids.map((q) => `wd:${q}`).join(" ");
  for (const th of THRESHOLDS) {
    const rows = toRows(await sparql(`SELECT ?pLabel ?pDescription ?sl WHERE { VALUES ?c { ${vals} } ${born(c)} FILTER(?sl>${th}) ${LABEL} } ORDER BY DESC(?sl) LIMIT 60`));
    if (rows.length >= 20 || th === THRESHOLDS.at(-1)) return rows;
  }
}

async function bigCountry(ids) {
  const vals = ids.map((q) => `wd:${q}`).join(" ");
  const all = [];
  for (const occ of OCCUPATIONS) {
    if (Date.now() > DEADLINE) break;
    try {
      all.push(...toRows(await sparql(`SELECT ?pLabel ?pDescription ?sl WHERE { VALUES ?c { ${vals} } ?p wdt:P106 wd:${occ}. ${born("?c")} FILTER(?sl>30) ${LABEL} } ORDER BY DESC(?sl) LIMIT 6`)));
    } catch (e) { if (!(e instanceof Timeout)) throw e; }
  }
  return all;
}

async function fetchCountry(qid, extra = []) {
  const ids = [qid, ...extra];
  try { return await oneQuery(ids); }
  catch (e) { if (!(e instanceof Timeout)) throw e; return bigCountry(ids); }
}

async function main() {
  const live = await readJson("../data/live.json");
  const rules = await readJson("../data/famous-rules.json");
  const prev = await readJson("../data/famous.json").catch(() => ({ countries: {} }));
  const codes = live.countries.map((c) => c.code);
  const seedArg = process.argv.indexOf("--seed");
  const seed = seedArg > 0 ? JSON.parse(await readFile(process.argv[seedArg + 1], "utf8")) : null;

  const countries = {};
  let failed = 0, skipped = 0;
  if (seed) {
    for (const code of codes) if (seed[code]) countries[code] = chooseFamous(seed[code], rules, code);
  } else {
    const ids = await sparql("SELECT ?iso ?c WHERE { ?c wdt:P298 ?iso }");
    const qid = Object.fromEntries(ids.map((r) => [r.iso.value, r.c.value.split("/").pop()]));
    const queue = codes.filter((c) => qid[c]);
    const keep = (code) => { if (prev.countries?.[code]) countries[code] = prev.countries[code]; };
    const worker = async () => {
      while (queue.length) {
        const code = queue.shift();
        if (Date.now() > DEADLINE) { skipped++; keep(code); continue; }
        try {
          const rows = await fetchCountry(qid[code], rules.sameCountryQids?.[code]);
          const picked = chooseFamous(rows, rules, code);
          if (picked.length) countries[code] = picked; else keep(code);
          if (picked.length < 4) console.warn(`${code}: only ${picked.length} people`);
        } catch (e) {
          failed++;
          console.warn(`${code}: ${e.message} (keeping previous)`);
          keep(code);
        }
        await sleep(500);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (failed > codes.length * 0.3) { console.error(`${failed} of ${codes.length} countries failed. Not writing.`); process.exit(1); }
  }
  const have = Object.values(countries).filter((a) => a.length).length;
  if (have < 30 && !seed) { console.error(`Only ${have} countries have people. Not writing.`); process.exit(1); }
  const out = { meta: { generatedAt: new Date().toISOString(), source: "Wikidata (CC0)", count: have }, countries };
  await writeFile(new URL("../data/famous.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote famous people for ${have} countries (${failed} failed, ${skipped} out of time).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
