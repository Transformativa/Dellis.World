// One-off diagnostic: what population statements does Wikidata hold for the peoples that show no size? Writes probe-report.json.
import { writeFile } from "node:fs/promises";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const names = ["Kurds", "Persians", "Armenians", "Basques", "Sámi", "Koreans", "Native Hawaiians"];
const report = [];
async function q(query) {
  const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60000) });
  return (await res.json()).results.bindings;
}
for (const n of names) {
  try {
    const f = await q(`SELECT ?e ?sl WHERE { ?e rdfs:label "${n}"@en; wdt:P31/wdt:P279* wd:Q41710; wikibase:sitelinks ?sl } ORDER BY DESC(?sl) LIMIT 1`);
    const qid = f[0]?.e.value.split("/").pop();
    if (!qid) { report.push({ n, qid: null }); continue; }
    const rows = await q(`SELECT ?v ?t ?placeLabel ?mLabel WHERE { wd:${qid} p:P1082 ?s. ?s ps:P1082 ?v. OPTIONAL { ?s pq:P585 ?t } OPTIONAL { ?s pq:P1001 ?place } OPTIONAL { ?s pq:P459 ?m } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?v) LIMIT 12`);
    const own = await q(`SELECT ?p ?pLabel WHERE { wd:${qid} ?pp ?x. ?p wikibase:claim ?pp. FILTER(CONTAINS(LCASE(STR(?pLabel)), "popul")) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 5`).catch(() => []);
    report.push({ n, qid, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]))) });
  } catch (e) { report.push({ n, error: String(e).slice(0, 100) }); }
  console.log(JSON.stringify(report.at(-1)).slice(0, 400));
}
await writeFile("probe-report.json", JSON.stringify(report, null, 1));
