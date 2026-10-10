// Monthly: rebuilds data/languages.json for the 120 most-spoken languages, using only public databases:
//   Unicode CLDR  - who speaks what, by country (percentages), English language names, and the usual writing system
//   World Bank    - country populations in data/live.json, so percentages become speaker numbers
//   Glottolog     - language family (CC BY 4.0)
//   ISO 639 table - maps two-letter codes to the three-letter codes Glottolog uses
// Usage: node scripts/refresh-languages.mjs
//        node scripts/refresh-languages.mjs --xml supp.xml --likely likely.xml --glottolog g.csv --codes codes.csv   (local files, no network)
// CLDR_TAG=release-48 picks a CLDR release; the default is the newest release.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCldr, languageTotals, countryLanguages } from "./lib/cldr.mjs";
import { codeTable, familyLookup, scriptsFromLikelySubtags, scriptName } from "./lib/glottolog.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FALLBACK_TAG = "release-48";
const arg = (n) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : null; };

async function latestTag() {
  if (process.env.CLDR_TAG) return process.env.CLDR_TAG;
  try {
    const h = { "user-agent": "dellis-world-refresh", accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) h.authorization = "Bearer " + process.env.GITHUB_TOKEN;
    const r = await fetch("https://api.github.com/repos/unicode-org/cldr/releases/latest", { headers: h });
    if (r.ok) { const j = await r.json(); if (/^release-\d+/.test(j.tag_name || "")) return j.tag_name; }
  } catch {}
  return FALLBACK_TAG;
}
async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "dellis-world-refresh" } });
  if (!res.ok) throw new Error(url + " -> " + res.status);
  return res.text();
}
const local = async (name, url, required) => {
  try { return arg(name) ? await readFile(arg(name), "utf8") : await get(url); }
  catch (e) { if (required) throw e; console.warn("Could not load " + name + " (" + e.message + "); keeping the previous value for it."); return null; }
};

const tag = arg("xml") ? process.env.CLDR_TAG || FALLBACK_TAG : await latestTag();
const cldrBase = `https://raw.githubusercontent.com/unicode-org/cldr/${tag}/common/supplemental/`;
const xml = await local("xml", cldrBase + "supplementalData.xml", true);
const likelyXml = await local("likely", cldrBase + "likelySubtags.xml");
const glottologCsv = await local("glottolog", "https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv");
const codesCsv = await local("codes", "https://raw.githubusercontent.com/datasets/language-codes/main/data/language-codes-full.csv");

const live = JSON.parse(await readFile(path.join(root, "data", "live.json"), "utf8"));
const prev = JSON.parse(await readFile(path.join(root, "data", "languages.json"), "utf8").catch(() => '{"languages":{}}')).languages;
const cldr = parseCldr(xml);
const totals = languageTotals(cldr, live.countries);

const scripts = likelyXml ? scriptsFromLikelySubtags(likelyXml) : {};
const familyOf = glottologCsv && codesCsv ? familyLookup(glottologCsv, codeTable(codesCsv)) : () => "";
const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
// A few regional languages have no English name in the built-in ICU data.
const FALLBACK_NAMES = { apc: "Levantine Arabic", apd: "Sudanese Arabic", skr: "Saraiki", rkt: "Rangpuri", tts: "Northeastern Thai (Isan)", hne: "Chhattisgarhi", fuv: "Nigerian Fulfulde", dcc: "Deccan", mey: "Hassaniya Arabic", syl: "Sylheti" };
const nameOf = (code) => { let n; try { n = displayNames.of(code); } catch {} return n && n !== code ? n : FALLBACK_NAMES[code]; };

const ranked = Object.entries(totals).sort((a, b) => b[1].speakers - a[1].speakers).slice(0, 120)
  .map(([code, v]) => [code, {
    ...v,
    name: nameOf(code),
    family: familyOf(code) || prev[code]?.family || "",
    script: scripts[code] ? scriptName(scripts[code]) : prev[code]?.script || "",
  }])
  .filter(([, v]) => v.name);
if (ranked.length < 50) throw new Error("Too few languages parsed (" + ranked.length + "); keeping the old file");

// Each country's main languages (any CLDR language, not only the top 120), used on the "people of" pages.
const byCountry = {};
for (const [code, rows] of Object.entries(countryLanguages(cldr, live.countries))) {
  const named = rows.map((r) => ({ name: nameOf(r.lang), speakers: r.speakers, official: r.official })).filter((r) => r.name).slice(0, 4);
  if (named.length) byCountry[code] = named;
}

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: `Unicode CLDR ${tag} (language use by country, names, writing systems), World Bank Open Data (populations) and Glottolog (language families, CC BY 4.0)`,
    cldrTag: tag, populationYear: live.populationYear,
  },
  languages: Object.fromEntries(ranked),
  countryLanguages: byCountry,
};
await writeFile(path.join(root, "data", "languages.json"), JSON.stringify(out) + "\n");
const noFamily = ranked.filter(([, v]) => !v.family).map(([c]) => c);
console.log("Wrote", ranked.length, "languages from CLDR", tag, noFamily.length ? "(no family for: " + noFamily.join(", ") + ")" : "");
