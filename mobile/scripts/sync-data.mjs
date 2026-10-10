// Copies the data files and fact engine from the repo root into the app, so the app works offline from first launch.
// Run before building: npm run sync-data
import { copyFile, mkdir } from "node:fs/promises";
const out = new URL("../src/generated/", import.meta.url);
await mkdir(out, { recursive: true });
for (const f of ["live", "famous", "languages", "faiths", "peoples-countries"]) await copyFile(new URL(`../../data/${f}.json`, import.meta.url), new URL(`${f}.json`, out));
await copyFile(new URL("../../facts.js", import.meta.url), new URL("facts.js", out));
console.log("Synced data and facts.js into src/generated/");
