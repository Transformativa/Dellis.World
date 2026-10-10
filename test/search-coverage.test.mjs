// Guards against "I searched for X and nothing came up". Add a line to NATIONALITIES whenever someone finds a gap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../facts.js");
const read = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const live = read("data/live.json");
const peoples = read("data/peoples-countries.json").peoples;
const langs = read("data/languages.json").languages;
const faiths = read("data/faiths.json").faiths;

const items = [
  ...live.countries.map((c) => ({ name: c.display, aka: c.aka, code: c.code, body: c.capital })),
  ...peoples.map((p) => ({ name: p.n, aka: [], code: "", body: "" })),
  ...Object.values(langs).map((l) => ({ name: l.name, aka: [], code: "", body: [l.family, l.script].join(" ") })),
  ...faiths.map((f) => ({ name: f.n, aka: f.aka || [], code: "", body: "" })),
];
const names = (q) => F.search(items, q).map((r) => r.name);

// Each search word must bring up a people (not only the country).
const NATIONALITIES = {
  Ukrainian: "Ukrainians", Ukrainians: "Ukrainians", Italian: "Italians", French: "French", Kazakh: "Kazakhs", Uzbek: "Uzbeks",
  Mexican: "Mexicans", Spanish: "Spanish (Spaniards)", Polish: "Poles (Polish)", Russian: "Russians", German: "Germans",
  Greek: "Greeks", Filipino: "Filipinos", Brazilian: "Brazilians", Thai: "Thais", Burmese: "Burmese", Portuguese: "Portuguese",
  Dutch: "Dutch", Swedish: "Swedes (Swedish)", Norwegian: "Norwegians", Danish: "Danes (Danish)", Finnish: "Finns (Finnish)",
  Czech: "Czechs", Hungarian: "Hungarians", Romanian: "Romanians", Serbian: "Serbs (Serbian)", Bulgarian: "Bulgarians",
  British: "British", American: "Americans", Canadian: "Canadians", Australian: "Australians", Egyptian: "Egyptians",
  Argentine: "Argentines (Argentinians)", Colombian: "Colombians", Peruvian: "Peruvians", Chilean: "Chileans", Cuban: "Cubans",
  Venezuelan: "Venezuelans", Kyrgyz: "Kyrgyz", Tajik: "Tajiks", Azerbaijani: "Azerbaijanis", Georgian: "Georgians", Croat: "Croats",
  Lithuanian: "Lithuanians", Estonian: "Estonians", Albanian: "Albanians", Icelander: "Icelanders", Somali: "Somalis",
};

test("searching a nationality finds that people", () => {
  for (const [q, want] of Object.entries(NATIONALITIES)) assert.ok(names(q).includes(want), `"${q}" should find ${want}, got: ${names(q).slice(0, 5).join(", ")}`);
});

test("every people, language and faith can be found by its own name", () => {
  for (const it of items.filter((i) => !i.code)) assert.ok(names(it.name).includes(it.name), `searching "${it.name}" does not return it`);
});

test("languages and faiths show up by name", () => {
  for (const [q, want] of [["Hindi", "Hindi"], ["Ukrainian", "Ukrainian"], ["Italian", "Italian"], ["Islam", "Islam"], ["Buddhism", "Buddhism"], ["Muslim", "Islam"], ["Christian", "Christianity"]])
    assert.ok(names(q).includes(want), `"${q}" should find ${want}`);
});
