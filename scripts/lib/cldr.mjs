// Reads language-use data from Unicode CLDR's supplementalData.xml (territoryInfo and codeMappings).
// CLDR is published by Unicode, Inc. under the Unicode License (see https://www.unicode.org/license.txt).

/** Returns { alpha3: {UA: "UKR"}, territories: {UA: [{lang, pct, status}]} } */
export function parseCldr(xml) {
  const alpha3 = {};
  for (const m of xml.matchAll(/<territoryCodes\s+type="([A-Z]{2})"[^>]*?alpha3="([A-Z]{3})"/g)) alpha3[m[1]] = m[2];
  const block = (xml.match(/<territoryInfo>([\s\S]*?)<\/territoryInfo>/) || [])[1] || "";
  const territories = {};
  for (const t of block.matchAll(/<territory\s+type="([A-Z0-9]{2,3})"[^>]*>([\s\S]*?)<\/territory>/g)) {
    const rows = [];
    for (const l of t[2].matchAll(/<languagePopulation\s+([^>]*?)\/>/g)) {
      const attr = (n) => (l[1].match(new RegExp("\\b" + n + '="([^"]*)"')) || [])[1];
      const type = attr("type"), pct = Number(attr("populationPercent"));
      if (!type || !Number.isFinite(pct)) continue;
      rows.push({ lang: type.split("_")[0], pct, status: attr("officialStatus") || "" });
    }
    territories[t[1]] = rows;
  }
  return { alpha3, territories };
}

/** Combines CLDR percentages with each country's population (World Bank) into one row per language. */
export function languageTotals(cldr, countries, topN = 10) {
  const popByCode = new Map(countries.map((c) => [c.code, c.pop]));
  const out = {};
  for (const [t, rows] of Object.entries(cldr.territories)) {
    const code = cldr.alpha3[t];
    const pop = popByCode.get(code);
    if (!code || !pop) continue;
    const seen = new Map();
    for (const r of rows) {
      const cur = seen.get(r.lang) || { pct: 0, status: "" };
      cur.pct = Math.min(100, cur.pct + r.pct);
      if (r.status && !cur.status) cur.status = r.status;
      seen.set(r.lang, cur);
    }
    for (const [lang, v] of seen) {
      const o = (out[lang] ||= { speakers: 0, countries: [] });
      const n = Math.round((pop * v.pct) / 100);
      o.speakers += n;
      o.countries.push({ code, speakers: n, pct: v.pct, official: v.status === "official" });
    }
  }
  for (const o of Object.values(out)) {
    o.officialIn = o.countries.filter((c) => c.official).length;
    o.countries = o.countries.filter((c) => c.speakers > 0).sort((a, b) => b.speakers - a.speakers).slice(0, topN);
  }
  return out;
}

/** For each country (ISO3 code), its most-spoken languages: [{ lang, speakers, pct, official }]. Uses every CLDR language, not just the top 120. */
export function countryLanguages(cldr, countries, n = 4) {
  const popByCode = new Map(countries.map((c) => [c.code, c.pop]));
  const out = {};
  for (const [t, rows] of Object.entries(cldr.territories)) {
    const code = cldr.alpha3[t];
    const pop = popByCode.get(code);
    if (!code || !pop) continue;
    const seen = new Map();
    for (const r of rows) {
      const cur = seen.get(r.lang) || { pct: 0, official: false };
      cur.pct = Math.min(100, cur.pct + r.pct);
      cur.official ||= r.status === "official";
      seen.set(r.lang, cur);
    }
    out[code] = [...seen].map(([lang, v]) => ({ lang, speakers: Math.round((pop * v.pct) / 100), pct: v.pct, official: v.official }))
      .filter((l) => l.speakers > 0).sort((a, b) => b.speakers - a.speakers).slice(0, n + 4);
  }
  return out;
}
