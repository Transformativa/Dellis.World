// Opens a monthly issue when hand-entered source data has not been re-checked for a year.
// Faith numbers come from Pew Research's published report (data year 2020, which is still the newest).
// Pew's terms forbid scraping, so a person re-checks pewresearch.org once a year and then updates meta.lastChecked in data/faiths.json.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_MONTHS_SINCE_CHECK = 12;
const faiths = JSON.parse(await readFile(path.join(root, "data", "faiths.json"), "utf8"));
const last = Date.parse(faiths.meta.lastChecked);
if (!last) { console.error("data/faiths.json meta.lastChecked is missing."); process.exit(1); }
const months = (Date.now() - last) / (30.44 * 24 * 3600 * 1000);
if (months > MAX_MONTHS_SINCE_CHECK) {
  console.error(`Faith numbers (data year ${faiths.meta.asOf}) were last checked ${Math.floor(months)} months ago. Look on pewresearch.org for a newer global religious composition report, update data/faiths.json if there is one, then set meta.lastChecked to today.`);
  process.exit(1);
}
console.log(`Faith numbers are for ${faiths.meta.asOf}, last checked ${faiths.meta.lastChecked}. OK.`);
