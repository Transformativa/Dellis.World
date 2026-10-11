// One-off diagnostic. Writes probe-report.json.
import { writeFile } from "node:fs/promises";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const report = [];
async function sparql(name, query, show = 3, timeout = 65000) {
  const t = Date.now();
  try {
    const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(timeout) });
    const text = await res.text(); let rows = null; try { rows = JSON.parse(text).results.bindings; } catch {}
    report.push({ name, status: res.status, ms: Date.now() - t, rows: rows?.length ?? null, sample: rows ? rows.slice(0, show).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]))) : text.slice(0, 200) });
  } catch (e) { report.push({ name, error: String(e).slice(0, 120), ms: Date.now() - t }); }
  console.log(JSON.stringify(report.at(-1)).slice(0, 300));
}
const plain = (lo, hi) => `SELECT ?p ?sl WHERE { ?p wikibase:sitelinks ?sl . FILTER(?sl>=${lo} && ?sl<${hi}) ?p wdt:P31 wd:Q5 }`;
await sparql("plain >=200", plain(200, 9999));
await sparql("plain 120-200", plain(120, 200));
await sparql("plain 80-120", plain(80, 120));
await sparql("plain 60-80", plain(60, 80));
await sparql("plain 45-60", plain(45, 60));
const per = (q, th) => `SELECT ?p ?pLabel ?pDescription ?sl WHERE { ?p wdt:P27 wd:${q}; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. FILTER(?sl>${th}) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 30`;
await sparql("Kazakhstan >8", per("Q232", 8), 6);
await sparql("Uzbekistan >8", per("Q265", 8), 6);
await sparql("Ukraine >40", per("Q212", 40), 6);
await sparql("Iceland >8", per("Q189", 8), 4);
// how big is one batch of entity details?
const t = Date.now();
try {
  const ids = ["Q1067", "Q254", "Q307", "Q1394", "Q7186", "Q937", "Q692", "Q5879"];
  const res = await fetch("https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&props=labels|descriptions|claims&languages=en&ids=" + ids.join("|"), { headers: { "User-Agent": UA } });
  const j = await res.json();
  report.push({ name: "wbgetentities 8", status: res.status, ms: Date.now() - t, sample: Object.values(j.entities).map((e) => `${e.labels?.en?.value}: P27=${(e.claims?.P27 || []).map((c) => c.mainsnak?.datavalue?.value?.id)} P19=${(e.claims?.P19 || []).map((c) => c.mainsnak?.datavalue?.value?.id)} P106=${(e.claims?.P106 || []).length}`) });
} catch (e) { report.push({ name: "wbgetentities", error: String(e) }); }
await writeFile("probe-report.json", JSON.stringify(report, null, 1));
