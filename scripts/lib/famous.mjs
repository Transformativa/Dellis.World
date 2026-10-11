// Picks the top people for one country from raw Wikidata rows.
// A row is [name, description, sitelinks]. Sitelinks = how many Wikipedia languages cover the person.
export const PER_COUNTRY = 5;

export function chooseFamous(rows, rules = {}, code = "", n = PER_COUNTRY) {
  const block = (rules.blockWords || []).map((w) => w.toLowerCase());
  const patterns = (rules.blockPatterns || []).map((p) => new RegExp(p, "i"));
  const exclude = new Set(rules.exclude || []);
  // Kids app: a person is only listed when their one-line description names a kid-friendly job (writer, scientist, athlete...).
  const jobs = rules.kidFriendlyJobs ? new RegExp("\\b(" + rules.kidFriendlyJobs + ")", "i") : null;
  const seen = new Set();
  const good = [];
  for (const [name, desc, sl] of rows || []) {
    if (!name || /^Q\d+$/.test(name)) continue; // no English label yet
    if (!desc || desc.length < 4) continue; // a description is what we show next to the name
    if (exclude.has(name)) continue;
    if (jobs && !jobs.test(desc)) continue;
    const d = desc.toLowerCase();
    if (block.some((w) => d.includes(w))) continue;
    if (patterns.some((re) => re.test(desc))) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    good.push({ name, desc: tidy(desc), sl: Number(sl) || 0 });
  }
  good.sort((a, b) => b.sl - a.sl);
  const pins = (rules.pin && rules.pin[code]) || [];
  const first = pins.map((p) => good.find((g) => g.name === p)).filter(Boolean);
  const rest = good.filter((g) => !first.includes(g));
  return [...first, ...rest].slice(0, n);
}

function tidy(s) {
  s = s.trim().replace(/\s+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
