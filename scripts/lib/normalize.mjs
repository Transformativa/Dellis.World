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

export function normalizeRows(rows, aliases, extras = []) {
  const notRanked = new Set(aliases.notRanked || []);
  const countries = rows.map((r) => {
    const [name, code, capital, pop, area, wbRegion, income, year] = r;
    const display = (aliases.display || {})[code] || name;
    const fixedCapital = (aliases.capitalFix || {})[code] || capital || "";
    const aka = [...((aliases.aka || {})[code] || [])];
    if (display !== name) aka.push(name);
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
    countries.push({ aka: (aliases.aka || {})[e.code] || [], year: e.asOf || "", ...e });
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
