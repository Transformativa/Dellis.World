import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseCldr, languageTotals } from "../scripts/lib/cldr.mjs";
const F = createRequire(import.meta.url)("../facts.js");
const read = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url), "utf8"));
const live = read("live.json"), langs = read("languages.json"), cur = read("languages-curated.json"), faiths = read("faiths.json");
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
});
test("every curated language has CLDR numbers and the text we show", () => {
  assert.ok(cur.languages.length >= 30);
  for (const l of cur.languages) {
    assert.ok(langs.languages[l.id]?.speakers > 1e6, l.id + " has no CLDR speakers");
    for (const k of ["n", "family", "script", "s", "fun", "special"]) assert.ok(l[k], l.id + " missing " + k);
    const rec = F.languageRecord(l, langs.languages[l.id], byCode);
    assert.ok(rec.known.length >= 4, l.id);
  }
});
test("faiths carry their source, year and required Pew disclaimer", () => {
  assert.equal(faiths.meta.asOf, 2020);
  assert.match(faiths.meta.disclaimer, /bears no responsibility/);
  assert.ok(faiths.faiths.length >= 8);
  for (const f of faiths.faiths) for (const k of ["n", "pl", "s", "fun", "special"]) assert.ok(f[k], f.id + " missing " + k);
});
test("search finds languages and faiths by name and by what people call them", () => {
  const items = [
    ...cur.languages.map((l) => ({ name: l.n, aka: l.aka, body: "" })),
    ...faiths.faiths.map((f) => ({ name: f.n, aka: f.aka, body: "" })),
  ];
  for (const [q, n] of [["Spanish", "Spanish"], ["Farsi", "Persian"], ["Tagalog", "Filipino"], ["Muslims", "Islam"], ["Buddhist", "Buddhism"], ["atheist", "Religiously unaffiliated"], ["Jews", "Judaism"]]) {
    assert.equal(F.search(items, q)[0]?.name, n, q);
  }
});
