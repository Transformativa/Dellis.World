// Fails when hand-entered source data is getting old, so the monthly run opens an issue.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_AGE_YEARS = 3;
const faiths = JSON.parse(await readFile(path.join(root, "data", "faiths.json"), "utf8"));
const age = new Date().getFullYear() - faiths.meta.asOf;
if (age > MAX_AGE_YEARS) {
  console.error(`Faith numbers are for ${faiths.meta.asOf}, ${age} years old. Check pewresearch.org for a newer global religious composition report and update data/faiths.json.`);
  process.exit(1);
}
console.log(`Faith numbers are for ${faiths.meta.asOf} (${age} years old). OK.`);
