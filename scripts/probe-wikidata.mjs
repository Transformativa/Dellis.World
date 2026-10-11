// One-off diagnostic: can Wikidata's search API give the best-known people of a country quickly? Writes probe-report.json.
import { writeFile } from "node:fs/promises";
const UA = "DellisWorld/1.0 (https://github.com/Transformativa/Dellis.World)";
const report = [];
const api = async (params) => {
  const res = await fetch("https://www.wikidata.org/w/api.php?format=json&origin=*&" + new URLSearchParams(params), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
};
async function country(name, qid) {
  const t = Date.now();
  try {
    const out = { name };
    for (const sort of ["relevance", "incoming_links_desc"]) {
      const s = await api({ action: "query", list: "search", srsearch: `haswbstatement:P31=Q5 haswbstatement:P27=${qid}`, srlimit: "40", srsort: sort, srnamespace: "0" });
      const ids = s.query.search.map((x) => x.title);
      const e = await api({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|sitelinks|claims", languages: "en" });
      const rows = Object.values(e.entities).map((x) => ({ id: x.id, name: x.labels?.en?.value, desc: x.descriptions?.en?.value, sl: Object.keys(x.sitelinks || {}).length, birth: x.claims?.P19?.[0]?.mainsnak?.datavalue?.value?.id }));
      rows.sort((a, b) => b.sl - a.sl);
      out[sort] = { total: s.query.searchinfo?.totalhits, found: ids.length, top: rows.slice(0, 8).map((r) => `${r.name} (${r.sl}) ${r.desc} born:${r.birth}`) };
    }
    out.ms = Date.now() - t;
    report.push(out);
  } catch (e) { report.push({ name, error: String(e), ms: Date.now() - t }); }
  console.log(JSON.stringify(report.at(-1)).slice(0, 600));
}
for (const [n, q] of [["Kazakhstan", "Q232"], ["Uzbekistan", "Q265"], ["Ukraine", "Q212"], ["United States", "Q30"], ["Italy", "Q38"], ["Iceland", "Q189"]]) await country(n, q);
await writeFile("probe-report.json", JSON.stringify(report, null, 1));
