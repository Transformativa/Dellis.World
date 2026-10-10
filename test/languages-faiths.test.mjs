import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseCldr, languageTotals } from "../scripts/lib/cldr.mjs";
const F = createRequire(import.meta.url)("../facts.js");
const read = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url), "utf8"));
const live = read("live.json"), langs = read("languages.json"), faiths = read("faiths.json");
const byCode = Object.fromEntries(live.countries.map((c) => [c.code, c]));

const XML = `<supplementalData><codeMappings>
<territoryCodes type="UA" numeric="804" alpha3="UKR"/><territoryCodes type="MD" numeric="498" alpha3="MDA"/></codeMappings>
<territoryInfo>
<territory type="UA" population="1"><languagePopulation type="uk" populationPercent="65" officialStatus="official"/><languagePopulation type="ru" literacyPercent="99" populationPercent="46" officialStatus="de_facto_official" references="R1"/></territory>
<territory type="MD" population="1"><languagePopulation type="uk" writingPercent="5" populationPercent="14"/></territory>
</territoryInfo></supplementalData>`;

test("CLDR parser reads percentages in any attribute order", () => {
  const c = parseCldr(XML);
  assert.equal(c.alpha3.UA, "UKR");
  assert.deepEqual(c.territories.UA.map((r) => r.lang), ["uk", "ru"]);
  assert.equal(c.territories.UA[1].pct, 46);
});
test("speakers are percentage times World Bank population", () => {
  const t = languageTotals(parseCldr(XML), [{ code: "UKR", pop: 1000 }, { code: "MDA", pop: 100 }]);
  assert.equal(t.uk.speakers, 650 + 14);
  assert.equal(t.uk.officialIn, 1);
  assert.equal(t.ru.speakers, 460);
  assert.equal(t.ru.officialIn, 0, "de facto official is not counted as official");
});
test("every language has CLDR numbers, a name, a Glottolog family and a writing system", () => {
  const all = Object.entries(langs.languages);
  assert.ok(all.length >= 100);
  for (const [code, d] of all) {
    assert.ok(d.name && d.name !== code, code + " has no name");
    assert.ok(d.speakers > 0 && d.countries.length, code + " has no CLDR numbers");
    assert.ok(d.script, code + " has no writing system");
  }
  assert.ok(all.filter(([, d]) => d.family).length >= all.length * 0.95, "most languages need a Glottolog family");
  assert.equal(langs.languages.uk.family, "Indo-European");
  assert.equal(langs.languages.zh.family, "Sino-Tibetan");
});
test("language entries are built only from the database fields", () => {
  for (const [code, d] of Object.entries(langs.languages)) {
    const rec = F.languageEntry(code, d, byCode);
    assert.equal(rec.fun, "", code); assert.equal(rec.special, "", code);
    assert.ok(rec.s.includes(d.name), code);
    assert.doesNotMatch([rec.s, ...rec.known, ...rec.stats.flat()].join(" "), /undefined|NaN|null/, code);
    assert.ok(rec.stats.some((r) => r[0] === "Speakers"), code);
  }
});
test("every country has main languages for the people-of pages", () => {
  const cl = langs.countryLanguages;
  for (const code of ["UKR", "ITA", "EST", "ISL", "KAZ"]) assert.ok(cl[code]?.length >= 1, code);
  assert.equal(cl.UKR[0].name, "Ukrainian");
});
test("faiths carry their source, year and required Pew disclaimer", () => {
  assert.equal(faiths.meta.asOf, 2020);
  assert.match(faiths.meta.disclaimer, /bears no responsibility/);
  assert.ok(faiths.faiths.length >= 8);
  for (const f of faiths.faiths) {
    assert.ok(f.n && f.stats?.length, f.id + " needs a name and Pew figures");
    const rec = F.faithEntry(f);
    assert.equal(rec.fun, ""); assert.equal(rec.special, ""); assert.equal(rec.s, "");
    assert.doesNotMatch(F.peopleFacts(rec).known.join(" ") + rec.stats.flat().join(" "), /undefined|NaN/);
  }
});
test("search finds languages and faiths by name and by what people call them", () => {
  const items = [
    ...Object.values(langs.languages).map((l) => ({ name: l.name, aka: [], body: "" })),
    ...faiths.faiths.map((f) => ({ name: f.n, aka: f.aka, body: "" })),
  ];
  for (const [q, n] of [["Spanish", "Spanish"], ["Hindi", "Hindi"], ["Ukrainian", "Ukrainian"], ["Muslims", "Islam"], ["Buddhist", "Buddhism"], ["atheist", "Religiously unaffiliated"], ["Jews", "Judaism"]]) {
    assert.equal(F.search(items, q)[0]?.name, n, q);
  }
});

test("each people is the people of one country, built from country data only", () => {
  const map = read("peoples-countries.json").peoples;
  assert.ok(map.length >= 40);
  for (const p of map) {
    const c = byCode[p.code];
    assert.ok(c, p.id + ": no such country " + p.code);
    const rec = F.nationalEntry(p, c, langs.countryLanguages[p.code] || []);
    assert.ok(rec.p > 0, p.id + " has no population");
    assert.ok(rec.stats.some((r) => r[0] === "Main languages"), p.id + " has no languages");
    assert.equal(rec.fun, ""); assert.equal(rec.special, "");
    assert.doesNotMatch([rec.s, ...rec.known, ...rec.stats.flat()].join(" "), /undefined|NaN|null/, p.id);
  }
  assert.equal(new Set(map.map((p) => p.id)).size, map.length, "duplicate people");
});
