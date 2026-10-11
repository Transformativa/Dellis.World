import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../facts.js");
const read = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const live = read("data/live.json");
const curated = read("data/curated.json");
const peoples = read("data/peoples.json").peoples;
const ctx = F.buildContext(live.countries);
const JAN = new Date("2026-01-15T12:00:00Z");

test("every country gets a fun fact, something special and known facts", () => {
  for (const c of live.countries) {
    const f = F.countryFacts(c, ctx, curated.countries[c.code], JAN);
    assert.ok(f.fun, `${c.code} has no fun fact`);
    assert.ok(f.special, `${c.code} has nothing special`);
    assert.ok(f.known.length > 0, `${c.code} has no known facts`);
    const all = [f.fun, f.special, ...f.known, ...f.records.map((r) => r.text)].join(" ");
    assert.doesNotMatch(all, /undefined|NaN|null|\.\./, `${c.code}: ${all}`);
  }
});

test("every people has a fun fact and something special", () => {
  assert.equal(peoples.length, 86);
  for (const p of peoples) {
    const f = F.peopleFacts(p, JAN);
    assert.ok(f.fun && f.special, p.n);
  }
});

test("curated entries point at real countries and name a source for each record", () => {
  const codes = new Set(live.countries.map((c) => c.code));
  for (const [code, e] of Object.entries(curated.countries)) {
    assert.ok(codes.has(code), `unknown code ${code}`);
    assert.ok(e.fun && e.special, code);
    for (const r of e.records || []) assert.ok(r.text && r.src, `${code} record needs text and src`);
  }
});

test("rankings come from the data and only count sovereign countries", () => {
  assert.equal(ctx.byPop[0].code, "IND");
  assert.equal(ctx.byArea[0].code, "RUS");
  assert.equal(ctx.byArea[ctx.byArea.length - 1].code, "VAT");
  assert.equal(ctx.byDens[0].code, "MCO");
  assert.ok(!ctx.rank.HKG, "Hong Kong should not be ranked");
  assert.ok(!ctx.rank.TWN, "Taiwan should not be ranked");
});

test("computed facts follow the numbers: a different leader changes the facts", () => {
  const copy = live.countries.map((c) => ({ ...c }));
  copy.find((c) => c.code === "CHN").pop = 2e9;
  const c2 = F.buildContext(copy);
  const china = copy.find((c) => c.code === "CHN");
  const f = F.countryFacts(china, c2, null, JAN);
  assert.match(f.known[0], /most populous country in the world/);
  assert.ok(f.records.some((r) => /Most populous/.test(r.text)));
});

test("facts for countries without hand-written entries change month to month", () => {
  const c = live.countries.find((x) => x.code === "KAZ");
  const seen = new Set();
  for (let m = 0; m < 12; m++) seen.add(F.countryFacts(c, ctx, null, new Date(2026, m, 15)).fun);
  assert.ok(seen.size > 1);
});

test("world fact of the month is stable within a month and changes across months", () => {
  const a = F.worldFactOfMonth(ctx, curated.world, new Date(2026, 4, 3));
  const b = F.worldFactOfMonth(ctx, curated.world, new Date(2026, 4, 28));
  assert.equal(a.text, b.text);
  const months = new Set();
  for (let m = 0; m < 12; m++) months.add(F.worldFactOfMonth(ctx, curated.world, new Date(2026, m, 5)).text);
  assert.ok(months.size >= 6);
  assert.equal(a.month, "May 2026");
});

test("freshness flags data older than 40 days and names the next refresh", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  const fresh = F.freshness("2026-11-01T05:00:00Z", now);
  assert.equal(fresh.stale, false);
  const old = F.freshness("2026-09-01T05:00:00Z", now);
  assert.equal(old.stale, true);
  assert.equal(old.nextRefresh.getMonth(), 11);
  assert.equal(old.nextRefresh.getDate(), 1);
});

test("search finds countries by common name, alias and capital, and peoples by language", () => {
  const items = [
    ...live.countries.map((c) => ({ name: c.display, aka: c.aka, code: c.code, body: c.capital })),
    ...peoples.map((p) => ({ name: p.n, aka: [], code: "", body: [p.home, p.lang, p.s].join(" ") }))
  ];
  const top = (q) => F.search(items, q)[0]?.name;
  assert.equal(top("russia"), "Russia");
  assert.equal(top("USA"), "United States");
  assert.equal(top("turkiye"), "Turkey");
  assert.equal(top("cote d ivoire"), "Ivory Coast");
  assert.equal(top("uae"), "United Arab Emirates");
  assert.equal(top("Ulaanbaatar"), "Mongolia");
  assert.equal(top("maasai"), "Maasai");
  assert.ok(F.search(items, "hebrew").some((i) => i.name === "Jewish people"));
});

test("number formatting", () => {
  assert.equal(F.fmtPop(1463865525), "1.46 billion");
  assert.equal(F.fmtPop(41651653), "41.7 million");
  assert.equal(F.fmtPop(12025), "12,000");
  assert.equal(F.fmtArea(0.44), "0.44 km²");
  assert.equal(F.fmtArea(17125190), "17.1 million km²");
  assert.equal(F.ordinal(22), "22nd");
  assert.equal(F.ordinal(113), "113th");
});

test("ethnicEntry shows population, languages and famous people from the data only", async () => {
  const { createRequire } = await import("node:module");
  const F2 = createRequire(import.meta.url)("../facts.js");
  const e = F2.ethnicEntry({ id: "k", n: "Kurds", population: 30000000, languages: ["Kurdish"], famous: [{ name: "A", desc: "Singer" }] });
  assert.equal(e.famous.length, 1);
  assert.deepEqual(e.stats.map((s) => s[0]), ["People", "Languages"]);
  assert.equal(e.known.length, 0);
});

test("heritageSentence gives one plain sentence from the heritage data, or nothing", () => {
  const c = { code: "ITA", display: "Italy", name: "Italy" };
  const t = F.heritageSentence(c, { count: 61, examples: ["Venice and its Lagoon", "Pompeii", "Florence"] });
  assert.match(t, /^Italy is home to UNESCO World Heritage Sites, places the whole world agrees to protect, like Venice and its Lagoon, Pompeii and Florence\.$/);
  assert.equal(F.heritageSentence(c, null), "");
  assert.equal(F.heritageSentence(c, { count: 5, examples: [] }), "");
});

test("ethnicEntry adds who they are and where they live from the data", async () => {
  const { createRequire } = await import("node:module");
  const F2 = createRequire(import.meta.url)("../facts.js");
  const countries = [{ code: "TUR", display: "Turkey", name: "Turkey", group: "mena" }, { code: "IRN", display: "Iran", name: "Iran", group: "mena" }];
  const e = F2.ethnicEntry({ id: "k", n: "Kurds", about: "Iranic ethnic group native to Kurdistan", where: [{ name: "Turkey", pop: 15000000 }, { name: "Iran", pop: 8000000 }], famous: [] }, countries);
  assert.match(e.s, /^Kurds: iranic ethnic group native to Kurdistan\.$/);
  assert.equal(e.stats[0][0], "Where they live most");
  assert.match(e.stats[0][1], /Turkey \(about 15/);
  assert.equal(e.stats[1][0], "Part of the world");
});
