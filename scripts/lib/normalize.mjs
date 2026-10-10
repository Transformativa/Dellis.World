// Turns raw World Bank rows into the compact country records the app reads.
// Row shape: [name, code, capital, population, areaKm2, wbRegion, income, year]

export function pickGroup(code, wbRegion, aliases) {
  const overrides = aliases.groupOverrides || {};
  for (const group of Object.keys(overrides)) {
    if (overrides[group].includes(code)) return group;
  }
  const key = String(wbRegion || "").trim();
  return (aliases.wbRegionToGroup || {})[key] || "europe";
}

/** "Ukrainian" -> ["Ukrainian", "Ukrainians"], so searching a nationality finds the country. */
export function demonymForms(list = []) {
  const out = [];
  for (const d of list) {
    out.push(d);
    if (!/(ese|ish|ch|ss|s)$/i.test(d)) out.push(d + "s");
  }
  return out;
}
function mergeAka(aka, code, aliases) {
  return [...new Set([...aka, ...demonymForms((aliases.demonyms || {})[code])])];
}

export function normalizeRows(rows, aliases, extras = []) {
  const notRanked = new Set(aliases.notRanked || []);
  const countries = rows.map((r) => {
    const [name, code, capital, pop, area, wbRegion, income, year] = r;
    const display = (aliases.display || {})[code] || name;
    const fixedCapital = (aliases.capitalFix || {})[code] || capital || "";
    let aka = [...((aliases.aka || {})[code] || [])];
    if (display !== name) aka.push(name);
    aka = mergeAka(aka, code, aliases);
    return {
      code,
      name,
      display,
      aka,
      capital: fixedCapital,
      pop: Number(pop) || 0,
      area: (aliases.areaFixes || {})[code] || Number(area) || 0,
      group: pickGroup(code, wbRegion, aliases),
      income: income || "",
      rank: !notRanked.has(code),
      year: String(year || ""),
    };
  });
  const have = new Set(countries.map((c) => c.code));
  for (const e of extras) {
    if (have.has(e.code)) continue;
    countries.push({ year: e.asOf || "", ...e, aka: mergeAka([...((aliases.aka || {})[e.code] || [])], e.code, aliases) });
  }
  countries.sort((a, b) => a.display.localeCompare(b.display));
  return countries;
}

export function validate(countries) {
  const problems = [];
  if (countries.length < 200) problems.push(`only ${countries.length} countries`);
  const ranked = countries.filter((c) => c.rank && c.pop > 0);
  const total = ranked.reduce((s, c) => s + c.pop, 0);
  if (total < 6e9 || total > 9.5e9) problems.push(`ranked population total looks wrong: ${total}`);
  const names = new Set(countries.map((c) => c.code));
  for (const must of ["IND", "CHN", "USA", "BRA", "NGA", "ISR"]) {
    if (!names.has(must)) problems.push(`missing ${must}`);
  }
  const bad = countries.filter((c) => c.pop < 0 || c.area < 0);
  if (bad.length) problems.push(`negative values for ${bad.map((c) => c.code).join(", ")}`);
  return problems;
}

// One country per line keeps monthly diffs readable in git.
export function serialize(meta, countries) {
  const head = JSON.stringify(meta).slice(0, -1);
  const body = countries.map((c) => "    " + JSON.stringify(c)).join(",\n");
  return `${head},\n  "countries": [\n${body}\n  ]\n}\n`;
}
