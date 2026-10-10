import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chooseFamous } from "../scripts/lib/famous.mjs";

const rules = JSON.parse(await readFile(new URL("../data/famous-rules.json", import.meta.url), "utf8"));
const live = JSON.parse(await readFile(new URL("../data/live.json", import.meta.url), "utf8"));

test("chooseFamous keeps top five by sitelinks, skips blanks, dupes and blocked words", () => {
  const rows = [
    ["A", "painter", 10], ["B", "Nazi leader", 99], ["Q123", "poet", 80], ["C", "", 70],
    ["D", "singer", 60], ["D", "singer", 61], ["E", "athlete", 50], ["F", "writer", 40], ["G", "chef", 30], ["H", "actor", 20],
  ];
  const out = chooseFamous(rows, rules);
  assert.deepEqual(out.map((x) => x.name), ["D", "E", "F", "G", "H"]);
  assert.equal(out[0].desc, "Singer");
});

test("pin puts a person first", () => {
  const out = chooseFamous([["A", "painter", 90], ["B", "poet", 10]], { pin: { XXX: ["B"] } }, "XXX");
  assert.equal(out[0].name, "B");
});

test("data/famous.json is well formed", async () => {
  const f = JSON.parse(await readFile(new URL("../data/famous.json", import.meta.url), "utf8"));
  assert.ok(f.meta.generatedAt && f.meta.source);
  const codes = new Set(live.countries.map((c) => c.code));
  const block = rules.blockWords.map((w) => w.toLowerCase());
  for (const [code, list] of Object.entries(f.countries)) {
    assert.ok(codes.has(code), `${code} is not a known country`);
    assert.ok(list.length <= 5, `${code} has more than five`);
    for (const p of list) {
      assert.ok(p.name && p.desc, `${code} person needs name and desc`);
      assert.ok(!block.some((w) => p.desc.toLowerCase().includes(w)), `${code}: ${p.name} has a blocked word`);
    }
  }
});

test("data/famous-peoples.json covers every people with at most five clean entries", async () => {
  const fp = JSON.parse(await readFile(new URL("../data/famous-peoples.json", import.meta.url), "utf8"));
  const peoples = JSON.parse(await readFile(new URL("../data/peoples.json", import.meta.url), "utf8")).peoples;
  const block = rules.blockWords.map((w) => w.toLowerCase());
  for (const p of peoples) {
    const list = fp.peoples[p.id];
    assert.ok(list && list.length >= 3 && list.length <= 5, `${p.id} needs 3 to 5 people`);
    for (const x of list) {
      assert.ok(x.name && x.desc, `${p.id} entry needs name and desc`);
      assert.ok(!block.some((w) => x.desc.toLowerCase().includes(w)), `${p.id}: ${x.name} has a blocked word`);
    }
  }
});
