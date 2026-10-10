// Monthly: for every country, find the 5 best-known people from Wikidata (CC0).
// A person counts for a country only if they are a citizen AND were born there. Citizenship alone is noisy in Wikidata.
// Usage: node scripts/refresh-famous.mjs            fetch from Wikidata
//        node scripts/refresh-famous.mjs --seed F   build from a saved { CODE: [[name, desc, sitelinks], ...] } file
// If too many countries fail, nothing is written and the old file stays.
import { readFile, writeFile } from "node:fs/promises";
import { chooseFamous } from "./lib/famous.mjs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const THRESHOLDS = [120, 50, 20, 8, 2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));

async function sparql(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(70000),
      });
      if (res.ok) return (await res.json()).results.bindings;
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
      await sleep((Number(res.headers.get("retry-after")) || attempt * 5) * 1000);
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(attempt * 5000);
    }
  }
  throw new Error("unreachable");
}

async function fetchCountry(qid, extra = []) {
  const ids = [qid, ...extra].map((q) => `wd:${q}`).join(" ");
  for (const th of THRESHOLDS) {
    const rows = await sparql(`SELECT ?pLabel ?pDescription ?sl WHERE {
      VALUES ?c { ${ids} } ?p wdt:P27 ?c; wdt:P31 wd:Q5; wdt:P19/wdt:P17 ?c; wikibase:sitelinks ?sl. FILTER(?sl>${th})
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 30`);
    const out = rows.map((r) => [r.pLabel.value, r.pDescription?.value || "", Number(r.sl.value)]);
    if (out.length >= 12 || th === THRESHOLDS.at(-1)) return out;
  }
}

async function main() {
  const live = await readJson("../data/live.json");
  const rules = await readJson("../data/famous-rules.json");
  const prev = await readJson("../data/famous.json").catch(() => ({ countries: {} }));
  const codes = live.countries.map((c) => c.code);
  const seedArg = process.argv.indexOf("--seed");
  const seed = seedArg > 0 ? JSON.parse(await readFile(process.argv[seedArg + 1], "utf8")) : null;

  const countries = {};
  let failed = 0;
  if (seed) {
    for (const code of codes) if (seed[code]) countries[code] = chooseFamous(seed[code], rules, code);
  } else {
    const ids = await sparql("SELECT ?iso ?c WHERE { ?c wdt:P298 ?iso }");
    const qid = Object.fromEntries(ids.map((r) => [r.iso.value, r.c.value.split("/").pop()]));
    for (const code of codes) {
      if (!qid[code]) continue;
      try {
        countries[code] = chooseFamous(await fetchCountry(qid[code], rules.sameCountryQids?.[code]), rules, code);
      } catch (e) {
        failed++;
        console.warn(`${code}: ${e.message} (keeping previous)`);
        if (prev.countries?.[code]) countries[code] = prev.countries[code];
      }
      await sleep(1500);
    }
    if (failed > codes.length * 0.3) {
      console.error(`${failed} of ${codes.length} countries failed. Not writing.`);
      process.exit(1);
    }
  }
  const have = Object.values(countries).filter((a) => a.length).length;
  if (have < 30 && !seed) { console.error(`Only ${have} countries have people. Not writing.`); process.exit(1); }
  const out = {
    meta: { generatedAt: new Date().toISOString(), source: "Wikidata (CC0)", count: have },
    countries,
  };
  await writeFile(new URL("../data/famous.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote famous people for ${have} countries (${failed} failed).`);
  await refreshPeoples(countries, out.meta.generatedAt);
}
// Peoples that match one country (Ukrainians, Italians...) take that country's fresh list. Others keep their hand-written list.
async function refreshPeoples(countries, generatedAt) {
  const map = (await readJson("../data/peoples-countries.json")).peoples;
  const file = await readJson("../data/famous-peoples.json");
  let updated = 0;
  for (const [id, code] of Object.entries(map)) {
    const fresh = (countries[code] || []).filter((x) => x.name && x.desc);
    if (fresh.length < 3) continue; // too thin: keep what we had
    file.peoples[id] = fresh.slice(0, 5).map((x) => ({ name: x.name, desc: x.desc }));
    updated++;
  }
  file.meta = { generatedAt, source: "Wikidata (CC0) for peoples tied to one country; hand-written for the rest", refreshed: updated };
  await writeFile(new URL("../data/famous-peoples.json", import.meta.url), JSON.stringify(file, null, 1) + "\n");
  console.log(`Refreshed famous people for ${updated} peoples from their country's list.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
