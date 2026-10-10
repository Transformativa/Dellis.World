import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { demonymForms } from "../scripts/lib/normalize.mjs";
const F = createRequire(import.meta.url)("../facts.js");
const live = JSON.parse(readFileSync(new URL("../data/live.json", import.meta.url), "utf8"));
const items = live.countries.map((c) => ({ kind: "country", name: c.display, aka: c.aka, body: "" }));

test("demonymForms adds a plural only when regular", () => {
  assert.deepEqual(demonymForms(["Ukrainian"]), ["Ukrainian", "Ukrainians"]);
  assert.deepEqual(demonymForms(["French", "Swiss"]), ["French", "Swiss"]);
});
test("searching a nationality finds the country", () => {
  for (const [q, name] of [["Ukrainian", "Ukraine"], ["Italians", "Italy"], ["French", "France"], ["Swiss", "Switzerland"], ["Dutch", "Netherlands"], ["Chinese", "China"]]) {
    assert.equal(F.search(items, q)[0]?.name, name, q);
  }
});
