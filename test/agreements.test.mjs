// "Things we agreed on." If a change breaks one of these, either the change is wrong or the agreement has changed on purpose.
// When an agreement changes on purpose, edit it here in the same commit so this file always matches what the owner decided.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const json = (p) => JSON.parse(read(p));
const app = read("mobile/App.tsx");
const appJson = json("mobile/app.json").expo;
const eas = json("mobile/eas.json");

test("name and store identity", () => {
  assert.equal(appJson.name, "World Facts");
  assert.equal(appJson.ios.bundleIdentifier, "store.dellis.worldpeople");
  assert.equal(appJson.android.package, "store.dellis.worldpeople");
  assert.equal(eas.submit.production.ios.ascAppId, "6821419147");
  assert.match(app, /World <Text[^>]*>Facts<\/Text>/s, "in-app title is World Facts with Facts in italics");
  for (const f of ["icon.png", "splash-icon.png", "dellis-mark.png", "dellis-wordmark.png"]) assert.ok(existsSync(new URL("../mobile/assets/" + f, import.meta.url)), f);
});

test("pricing: $2.99 a year, three free looks, no trial, and real purchases are never unlocked for free", () => {
  const p = read("mobile/src/purchase.ts");
  assert.match(p, /PRICE_LABEL = "\$2\.99 \/ year"/);
  assert.match(p, /FREE_LOOKS = 3\b/);
  assert.doesNotMatch(p, /TRIAL_LABEL|free trial|trial period/i);
  assert.equal(eas.build.production.env?.EXPO_PUBLIC_DEV_UNLOCK, undefined, "the production build must never carry the test unlock");
  assert.match(app, /Maybe later/); assert.match(app, /Restore purchase/);
});

test("brand colours, font and shape", () => {
  const th = read("mobile/src/theme.ts");
  for (const [k, v] of Object.entries({ bg: "#F7FEF9", fg: "#232323", muted: "#4A4A4A", line: "#E1EAE3", green: "#4CFC0F", coral: "#FF8969", orange: "#E44E0F" }))
    assert.match(th, new RegExp(`${k}: "${v}"`, "i"), k);
  assert.match(th, /radius: 14/);
  assert.match(app, /Questrial_400Regular/);
});

test("screens and wording we agreed on", () => {
  assert.match(app, /\["all", "All"\], \["people", "Peoples"\], \["country", "Countries"\], \["language", "Languages"\], \["faith", "Faiths"\]/);
  assert.match(app, /My Favorites/); assert.doesNotMatch(app, /My Roots/);
  assert.match(app, /Another fact/);
  assert.match(app, /pickMix\(featured, 25, seed\)/, "the All view shows a mix of 25");
  assert.match(app, /Showing \$\{rows\.length\} of/);
  for (const w of ["Why these peoples?", "Why these languages?", "Why these groups?"]) assert.ok(app.includes(w), w);
  for (const w of ["Sort: A to Z", "Random", "All regions", "Explore"]) assert.ok(app.includes(w), w);
  assert.match(app, /KIND_COLOR[^\n]*language: "#1B9AAA"[^\n]*faith: "#7FA386"/);
});

test("sources are credited in small print at the bottom", () => {
  assert.match(app, /SOURCES/);
  for (const w of ["World Bank", "Wikidata", "Glottolog", "CLDR", "faiths?.meta?.citation", "faiths?.meta?.disclaimer", "Numbers refresh on the 1st of each month"]) assert.ok(app.includes(w), w);
  const faiths = json("data/faiths.json").meta;
  assert.match(faiths.citation, /Pew Research Center/);
  assert.match(faiths.disclaimer, /bears no responsibility for the analyses or interpretations/);
});

test("everything shown comes from a database: the app ships no hand-written text files", () => {
  const sync = read("mobile/scripts/sync-data.mjs");
  assert.match(sync, /\["live", "famous", "languages", "faiths", "ethnic", "peoples-countries"\]/);
  for (const f of ["curated", "peoples", "famous-peoples", "languages-curated"]) assert.ok(!existsSync(new URL(`../mobile/src/generated/${f}.json`, import.meta.url)), f + " must not ship in the app");
  assert.doesNotMatch(read("mobile/src/data.ts"), /curated|famousPeoples/);
});

test("monthly refresh keeps every data source current", () => {
  const wf = read(".github/workflows/refresh-monthly.yml");
  for (const s of ["scripts/refresh.mjs", "scripts/refresh-famous.mjs", "scripts/refresh-languages.mjs", "scripts/check-sources.mjs", "node --test"]) assert.ok(wf.includes(s), s);
  assert.match(wf, /data\/live\.json data\/famous\.json data\/ethnic\.json data\/languages\.json/);
});

test("kids app: wording in the app and the people we list is kid friendly", () => {
  const bad = /\b(kill|killed|murder|dead|death|die[sd]?|war|wars|genocide|terror\w*|sex\w*|porn\w*|drug\w*|alcohol|gambl\w*|weapon\w*|massacre|slave\w*|suicide|abuse\w*|racis\w*|violen\w*)\b/i;
  const strings = [...app.matchAll(/>([^<>{}]{12,})</g)].map((m) => m[1]).concat([...app.matchAll(/"([A-Z][^"\n]{20,})"/g)].map((m) => m[1]));
  for (const s of strings) assert.ok(!bad.test(s), `not kid friendly: ${s}`);
  const f = json("data/famous.json");
  for (const [code, list] of Object.entries(f.countries)) for (const p of list) assert.ok(!bad.test(p.desc), `${code}: ${p.name}: ${p.desc}`);
});

test("kids app: country facts use no grown-up money words", async () => {
  const { createRequire } = await import("node:module");
  const F = createRequire(import.meta.url)("../facts.js");
  const live = json("data/live.json");
  const ctx = F.buildContext(live.countries);
  const jargon = /\b(income|economy|economic|gdp|classed|politically|sparsely|densely)\b/i;
  for (const c of live.countries) {
    const f = F.countryFacts(c, ctx, null, new Date("2026-10-10"));
    const all = JSON.stringify([f.known, f.fun, f.special, f.records]);
    assert.ok(!jargon.test(all), c.code + ": " + (all.match(jargon) || [""])[0]);
  }
});
