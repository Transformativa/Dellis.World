// Language family from Glottolog (https://glottolog.org, CC BY 4.0) and writing system from CLDR's likelySubtags.
// Codes are mapped with the free ISO 639 table in github.com/datasets/language-codes.

/** Small CSV reader that handles quoted fields. Returns an array of objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// CLDR lists a few macrolanguages (for example "zh" for Chinese). Glottolog files the individual languages, which share the family.
export const MACRO_MEMBER = { zh: "cmn", ar: "arb", sw: "swh", lah: "pnb", fa: "pes", or: "ory", om: "gaz", ms: "zsm", az: "azj", mg: "plt", mwr: "rwr", qu: "quz", bal: "bgp", man: "mnk" };

/** ISO 639-1 (two letter) to ISO 639-3 (three letter), from the language-codes table. */
export function codeTable(csvText) {
  const out = {};
  for (const r of parseCsv(csvText)) if (r.alpha2) out[r.alpha2] = r["alpha3-t"] || r["alpha3-b"];
  return out;
}

/** Returns a function: CLDR language code -> family name ("Indo-European", "Language isolate") or "". */
export function familyLookup(glottologCsv, codes) {
  const rows = parseCsv(glottologCsv);
  const byId = new Map(rows.map((r) => [r.ID, r]));
  const byIso = new Map(rows.filter((r) => r.ISO639P3code).map((r) => [r.ISO639P3code, r]));
  return (code) => {
    const iso3 = MACRO_MEMBER[code] || (code.length === 3 ? code : codes[code]);
    const r = byIso.get(iso3);
    if (!r) return "";
    if (r.Is_Isolate === "true") return "Language isolate";
    return byId.get(r.Family_ID)?.Name || "";
  };
}

/** Reads likelySubtags.xml and returns { uk: "Cyrl", zh: "Hans", ... }. */
export function scriptsFromLikelySubtags(xml) {
  const out = {};
  for (const m of xml.matchAll(/<likelySubtag\s+from="([a-z]{2,3})"\s+to="[a-z]{2,3}_([A-Z][a-z]{3})_[A-Z0-9]{2,3}"/g)) out[m[1]] = m[2];
  return out;
}

/** English script name such as "Cyrillic" or "Simplified Han". */
export function scriptName(code) {
  let n = "";
  try { n = new Intl.DisplayNames(["en"], { type: "script" }).of(code) || ""; } catch {}
  return n === "Simplified" || n === "Traditional" ? n + " Han" : n;
}
