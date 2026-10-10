// One-off diagnostic: how fast and how complete is Wikidata from this machine? Writes probe-report.json.
import { writeFile } from "node:fs/promises";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const report = [];
async function run(name, query, show = 3) {
  const t = Date.now();
  try {
    const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(65000) });
    const text = await res.text();
    let rows = null; try { rows = JSON.parse(text).results.bindings; } catch {}
    report.push({ name, status: res.status, ms: Date.now() - t, rows: rows?.length ?? null, sample: rows ? rows.slice(0, show).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]))) : text.slice(0, 300) });
  } catch (e) { report.push({ name, error: String(e).slice(0, 200), ms: Date.now() - t }); }
  console.log(JSON.stringify(report.at(-1)).slice(0, 400));
}
const band = (lo, hi) => `SELECT ?p ?pLabel ?pDescription ?sl ?c WHERE { ?p wdt:P31 wd:Q5; wikibase:sitelinks ?sl; wdt:P27 ?c; wdt:P19/wdt:P17 ?c. FILTER(?sl>${lo} && ?sl<=${hi}) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } }`;
await run("iso map", "SELECT ?iso ?c WHERE { ?c wdt:P298 ?iso }");
for (const [lo, hi] of [[150, 9999], [100, 150], [70, 100], [50, 70], [35, 50]]) await run(`band ${lo}-${hi}`, band(lo, hi));
await run("USA per-country >120", `SELECT ?pLabel ?pDescription ?sl WHERE { VALUES ?c { wd:Q30 } ?p wdt:P27 ?c; wdt:P31 wd:Q5; wdt:P19/wdt:P17 ?c; wikibase:sitelinks ?sl. FILTER(?sl>120) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 30`);
for (const n of ["Kurds", "Roma people", "Han Chinese", "Yoruba people", "Maya peoples", "Māori", "Pashtuns", "Basques", "Zulu people", "Navajo", "Armenians", "Jewish people", "Arabs", "Persians"]) {
  await run(`ethnic ${n}`, `SELECT ?e ?eLabel ?pop ?lang ?langLabel WHERE { ?e rdfs:label "${n}"@en; wdt:P31/wdt:P279* wd:Q41710. OPTIONAL { ?e wdt:P1082 ?pop } OPTIONAL { ?e wdt:P2936 ?lang } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 12`, 4);
}
await run("people of Kurds (P172)", `SELECT ?pLabel ?pDescription ?sl WHERE { ?e rdfs:label "Kurds"@en; wdt:P31/wdt:P279* wd:Q41710. ?p wdt:P172 ?e; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 8`, 8);
await writeFile("probe-report.json", JSON.stringify(report, null, 1));
