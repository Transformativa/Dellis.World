import AsyncStorage from "@react-native-async-storage/async-storage";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const F = require("./generated/facts.js");

// The app ships with a copy of the data and checks for a newer monthly copy when it opens.
const BASE = "https://transformativa.github.io/Dellis.World/data/";
const FILES = ["live", "famous", "languages", "ethnic"] as const;
// Everything shown comes from public databases: World Bank, Unicode CLDR, Glottolog, Wikidata and Pew Research.
const bundled: Record<string, any> = {
  live: require("./generated/live.json"),
  famous: require("./generated/famous.json"),
  languages: require("./generated/languages.json"),
  ethnic: require("./generated/ethnic.json"),
  faiths: require("./generated/faiths.json"),
  peoplesMap: require("./generated/peoples-countries.json"),
};

export type Item = {
  kind: "people" | "country" | "language" | "faith"; id: string; name: string; aka: string[]; group: string; popM: number;
  popLabel: string; body: string; featured: boolean; data: any;
};
export type Loaded = { items: Item[]; ctx: any; live: any; famous: any; fresh: any; languages: any; faiths: any };

export { F };

const label = (m: number) => (m ? "~" + F.fmtPop(m * 1e6) : "");

export function buildItems(countries: any[], peoplesMap: any[], languages: any, faiths: any, ethnic: any = null): Item[] {
  const out: Item[] = [];
  const byCode: Record<string, any> = Object.fromEntries(countries.map((c) => [c.code, c]));
  const bigCountries = new Set([...countries].sort((a, b) => b.pop - a.pop).slice(0, 40).map((c) => c.code));

  for (const p of peoplesMap) {
    const c = byCode[p.code];
    if (!c) continue;
    const rec = F.nationalEntry(p, c, languages?.countryLanguages?.[p.code] || []);
    out.push({
      kind: "people", id: "p-" + p.id, name: p.n, aka: [], group: c.group, popM: rec.p, popLabel: label(rec.p),
      body: [c.display, c.capital, ...(languages?.countryLanguages?.[p.code] || []).map((l: any) => l.name)].join(" "), featured: true, data: rec,
    });
  }
  for (const g of Object.values<any>(ethnic?.groups || {})) {
    const rec = F.ethnicEntry(g);
    out.push({
      kind: "people", id: "e-" + g.id, name: g.n, aka: g.aka || [], group: "", popM: rec.p, popLabel: label(rec.p),
      body: [g.n, ...(g.languages || [])].join(" "), featured: true, data: rec,
    });
  }
  for (const c of countries) {
    out.push({
      kind: "country", id: "c-" + c.code, name: c.display, aka: c.aka || [], group: c.group,
      popM: c.pop / 1e6, popLabel: c.pop ? "~" + F.fmtPop(c.pop) : "", body: [c.capital, c.name].join(" "),
      featured: bigCountries.has(c.code), data: c,
    });
  }
  const langs = Object.entries<any>(languages?.languages || {}).filter(([, d]) => d.name);
  const topLangs = new Set([...langs].sort((a, b) => b[1].speakers - a[1].speakers).slice(0, 30).map(([code]) => code));
  for (const [code, d] of langs) {
    const rec = F.languageEntry(code, d, byCode);
    out.push({
      kind: "language", id: "l-" + code, name: d.name, aka: [], group: "", popM: rec.p, popLabel: label(rec.p),
      body: [d.name, d.family, d.script].join(" "), featured: topLangs.has(code), data: rec,
    });
  }
  for (const f of faiths?.faiths || []) {
    const rec = F.faithEntry(f);
    out.push({
      kind: "faith", id: "f-" + f.id, name: f.n, aka: f.aka || [], group: "", popM: rec.p, popLabel: rec.pl ? "~" + rec.pl.replace("about ", "") : "",
      body: f.n, featured: true, data: rec,
    });
  }
  return out;
}

export function assemble(d: Record<string, any>, now = new Date()): Loaded {
  const ctx = F.buildContext(d.live.countries);
  return {
    items: buildItems(d.live.countries, d.peoplesMap.peoples, d.languages, d.faiths, d.ethnic),
    ctx, live: d.live, famous: d.famous, languages: d.languages, faiths: d.faiths, fresh: F.freshness(d.live.generatedAt, now),
  };
}

function newer(a: any, b: any) {
  const ta = Date.parse(a?.meta?.generatedAt || a?.generatedAt || 0), tb = Date.parse(b?.meta?.generatedAt || b?.generatedAt || 0);
  return ta >= tb ? a : b;
}

/** Loads the best data we have right now. Never throws; falls back to the bundled copy. */
export async function loadData(): Promise<Loaded> {
  const d: Record<string, any> = { ...bundled };
  try {
    for (const f of FILES) {
      const cached = await AsyncStorage.getItem("data:" + f);
      if (cached) d[f] = newer(JSON.parse(cached), d[f]);
    }
  } catch {}
  return assemble(d);
}

/** Fetches the latest monthly data in the background and stores it for next launch. Returns true if anything changed. */
export async function refreshData(): Promise<boolean> {
  let changed = false;
  try {
    const last = Number((await AsyncStorage.getItem("data:checkedAt")) || 0);
    if (Date.now() - last < 12 * 3600 * 1000) return false;
    for (const f of FILES) {
      const res = await fetch(BASE + f + ".json", { headers: { "cache-control": "no-cache" } });
      if (!res.ok) continue;
      const json = await res.json();
      const cur = JSON.parse((await AsyncStorage.getItem("data:" + f)) || "null") || bundled[f];
      if (newer(json, cur) === json && json !== cur && (json.meta?.generatedAt || json.generatedAt) !== (cur.meta?.generatedAt || cur.generatedAt)) {
        await AsyncStorage.setItem("data:" + f, JSON.stringify(json));
        changed = true;
      }
    }
    await AsyncStorage.setItem("data:checkedAt", String(Date.now()));
  } catch {}
  return changed;
}
