// Monthly: rebuilds data/languages.json from Unicode CLDR language-use percentages and the World Bank populations in data/live.json.
// Usage: node scripts/refresh-languages.mjs [--xml FILE]   (CLDR_TAG=release-48 picks a release; default is the newest release)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCldr, languageTotals } from "./lib/cldr.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FALLBACK_TAG = "release-48";

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

const xmlArg = process.argv.indexOf("--xml");
let xml, tag;
if (xmlArg > -1) { xml = await readFile(process.argv[xmlArg + 1], "utf8"); tag = process.env.CLDR_TAG || FALLBACK_TAG; }
else {
  tag = await latestTag();
  const res = await fetch(`https://raw.githubusercontent.com/unicode-org/cldr/${tag}/common/supplemental/supplementalData.xml`);
  if (!res.ok) throw new Error("CLDR download failed: " + res.status);
  xml = await res.text();
}
const live = JSON.parse(await readFile(path.join(root, "data", "live.json"), "utf8"));
const totals = languageTotals(parseCldr(xml), live.countries);
const ranked = Object.entries(totals).sort((a, b) => b[1].speakers - a[1].speakers).slice(0, 120);
if (ranked.length < 50) throw new Error("Too few languages parsed (" + ranked.length + "); keeping the old file");
const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "Unicode CLDR " + tag + " (language use by country) with World Bank Open Data populations",
    cldrTag: tag, populationYear: live.populationYear,
  },
  languages: Object.fromEntries(ranked),
};
await writeFile(path.join(root, "data", "languages.json"), JSON.stringify(out) + "\n");
console.log("Wrote", ranked.length, "languages from CLDR", tag);
