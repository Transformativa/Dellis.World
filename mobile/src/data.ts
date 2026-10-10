import AsyncStorage from "@react-native-async-storage/async-storage";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const F = require("./generated/facts.js");

// The app ships with a copy of the data and checks for a newer monthly copy when it opens.
const BASE = "https://transformativa.github.io/Dellis.World/data/";
const FILES = ["live", "curated", "peoples", "famous"] as const;
const bundled: Record<string, any> = {
  live: require("./generated/live.json"),
  curated: require("./generated/curated.json"),
  peoples: require("./generated/peoples.json"),
  famous: require("./generated/famous.json"),
};

export type Item = {
  kind: "people" | "country"; id: string; name: string; aka: string[]; group: string; popM: number;
  popLabel: string; body: string; featured: boolean; data: any;
};
export type Loaded = { items: Item[]; ctx: any; live: any; curated: any; famous: any; fresh: any };

export { F };

export function buildItems(peoples: any[], countries: any[], curated: any): Item[] {
  const out: Item[] = [];
  for (const p of peoples) {
    out.push({
      kind: "people", id: "p-" + p.id, name: p.n, aka: [], group: p.g, popM: p.p,
      popLabel: p.pl.split(",")[0].replace("about ", "~").replace("over ", ">"),
      body: [p.home, p.lang, p.s, p.fun, p.special].join(" "), featured: true, data: p,
    });
  }
  for (const c of countries) {
    out.push({
      kind: "country", id: "c-" + c.code, name: c.display, aka: c.aka || [], group: c.group,
      popM: c.pop / 1e6, popLabel: c.pop ? "~" + F.fmtPop(c.pop) : "", body: [c.capital, c.name].join(" "),
      featured: !!(curated.countries && curated.countries[c.code]), data: c,
    });
  }
  return out;
}

export function assemble(d: Record<string, any>, now = new Date()): Loaded {
  const ctx = F.buildContext(d.live.countries);
  return {
    items: buildItems(d.peoples.peoples, d.live.countries, d.curated),
    ctx, live: d.live, curated: d.curated, famous: d.famous, fresh: F.freshness(d.live.generatedAt, now),
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
    for (const f of ["live", "famous"] as const) {
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
