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
const OCC = { Q36180: "writer", Q1028181: "painter", Q169470: "physicist", Q36834: "composer", Q177220: "singer", Q49757: "poet", Q205375: "inventor", Q11631: "astronaut", Q11900058: "explorer", Q3665646: "basketball player", Q937857: "association football player", Q170790: "mathematician", Q593644: "chemist", Q33999: "actor", Q4964182: "philosopher", Q483501: "artist", Q901: "scientist", Q42973: "architect", Q2526255: "film director", Q11063: "astronomer", Q10833314: "tennis player", Q82955: "politician", Q6625963: "novelist", Q1622272: "university teacher", Q3055126: "naturalist", Q39631: "physician", Q81096: "engineer", Q2066131: "athlete", Q639669: "musician", Q214917: "playwright", Q2095: "food" };
await sparql("occupation labels", `SELECT ?o ?oLabel WHERE { VALUES ?o { ${Object.keys(OCC).map((q) => "wd:" + q).join(" ")} } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`, 40);
const usa = (occ, th) => `SELECT ?p ?pLabel ?pDescription ?sl WHERE { ?p wdt:P106 wd:${occ}; wdt:P27 wd:Q30; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. FILTER(?sl>${th}) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 10`;
await sparql("USA painter >30", usa("Q1028181", 30), 5);
await sparql("USA physicist >30", usa("Q169470", 30), 5);
await sparql("USA writer >60", usa("Q36180", 60), 5);
await sparql("USA basketball >30", usa("Q3665646", 30), 5);
await sparql("USA composer >30", usa("Q36834", 30), 5);
await sparql("USA inventor >20", usa("Q205375", 20), 5);
await sparql("USA values-all >70", `SELECT ?p ?pLabel ?pDescription ?sl WHERE { VALUES ?occ { wd:Q36180 wd:Q1028181 wd:Q169470 wd:Q36834 wd:Q177220 wd:Q49757 wd:Q205375 wd:Q11631 } ?p wdt:P106 ?occ; wdt:P27 wd:Q30; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. FILTER(?sl>70) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY DESC(?sl) LIMIT 20`, 10);
await writeFile("probe-report.json", JSON.stringify(report, null, 1));
