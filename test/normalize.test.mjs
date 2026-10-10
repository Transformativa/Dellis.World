import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeRows, pickGroup, validate, serialize } from "../scripts/lib/normalize.mjs";

const read = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const aliases = read("data/aliases.json");
const extras = read("data/extra-countries.json").countries;
const seed = read("scripts/seed/worldbank-2026-10-10.json");

test("groups: Central Asia, the Caucasus, Pacific islands and North Africa land where expected", () => {
  const g = (code, region) => pickGroup(code, region, aliases);
  assert.equal(g("KAZ", "Europe & Central Asia"), "asia");
  assert.equal(g("TUR", "Europe & Central Asia"), "mena");
  assert.equal(g("AUS", "East Asia & Pacific"), "oceania");
  assert.equal(g("JPN", "East Asia & Pacific"), "asia");
  assert.equal(g("EGY", "Middle East, North Africa, Afghanistan & Pakistan"), "mena");
  assert.equal(g("PAK", "Middle East, North Africa, Afghanistan & Pakistan"), "asia");
  assert.equal(g("BRA", "Latin America & Caribbean "), "americas");
  assert.equal(g("NGA", "Sub-Saharan Africa "), "africa");
});

test("seed snapshot normalises and passes validation", () => {
  const countries = normalizeRows(seed.rows, aliases, extras);
  assert.deepEqual(validate(countries), []);
  const byCode = Object.fromEntries(countries.map((c) => [c.code, c]));
  assert.equal(byCode.RUS.display, "Russia");
  assert.equal(byCode.UKR.capital, "Kyiv");
  assert.equal(byCode.CAN.area, 9984670);
  assert.equal(byCode.ISR.capital, "", "no capital is invented where the source has none");
  assert.equal(byCode.HKG.rank, false);
  assert.ok(byCode.VAT.manual && byCode.TWN.manual);
});

test("validation refuses obviously broken downloads", () => {
  const few = normalizeRows(seed.rows.slice(0, 20), aliases, []);
  assert.ok(validate(few).length > 0);
  const zeroed = normalizeRows(seed.rows.map((r) => [...r.slice(0, 3), 0, ...r.slice(4)]), aliases, extras);
  assert.ok(validate(zeroed).some((p) => /population total/.test(p)));
});

test("serialised output is valid JSON with one country per line", () => {
  const countries = normalizeRows(seed.rows, aliases, extras);
  const text = serialize({ generatedAt: "2026-10-10T00:00:00Z", count: countries.length }, countries);
  const parsed = JSON.parse(text);
  assert.equal(parsed.countries.length, countries.length);
  assert.ok(text.split("\n").length > countries.length);
});
