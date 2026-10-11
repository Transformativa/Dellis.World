/* Dellis World fact engine.
 * Pure functions, no DOM. Runs in the browser (window.DellisFacts) and in Node (require).
 * Every country gets facts even when nobody has written any: hand-written entries in
 * data/curated.json come first, and the rest is worked out from data/live.json. Because the
 * numbers come from live.json, rankings and "world facts" change when the monthly refresh runs.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DellisFacts = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var GROUPS = {
    africa: "Africa", americas: "Americas", asia: "Asia",
    europe: "Europe", mena: "Middle East", oceania: "Oceania"
  };
  var GROUP_IN = {
    africa: "Africa", americas: "the Americas", asia: "Asia",
    europe: "Europe", mena: "the Middle East", oceania: "Oceania"
  };
  /* Names that read better with "the" in a sentence. */
  var THE = {
    USA: 1, GBR: 1, ARE: 1, NLD: 1, PHL: 1, COD: 1, COG: 1, CAF: 1, DOM: 1, MHL: 1, SLB: 1,
    MDV: 1, SYC: 1, COM: 1, CYM: 1, TCA: 1, VGB: 1, FRO: 1, VIR: 1
  };
  var STALE_AFTER_DAYS = 40;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function group(n) { return Math.round(n).toLocaleString("en-US"); }
  function sig2(n) {
    if (n < 100) return Math.round(n / 10) * 10;
    var p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  }
  function fmtPop(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " billion";
    if (n >= 1e6) { var m = n / 1e6; return (m >= 100 ? Math.round(m) : m.toFixed(1)) + " million"; }
    if (n >= 1000) return group(sig2(n));
    return String(sig2(n));
  }
  function fmtArea(a) {
    if (a >= 1e6) return (a / 1e6).toFixed(1) + " million km²";
    if (a >= 100) return group(a) + " km²";
    return (Math.round(a * 100) / 100) + " km²";
  }
  function fmtDensity(d) { return d >= 10 ? group(d) : (Math.round(d * 10) / 10).toString(); }
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
  function monthSeed(date) { return date.getFullYear() * 12 + date.getMonth(); }
  function pick(list, seed) { return list.length ? list[Math.abs(seed) % list.length] : ""; }
  function asList(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
  function an(word) { return /^[aeiou]/i.test(word) ? "an " + word : "a " + word; }
  function endSentence(s) { return /[.!?]$/.test(s) ? s : s + "."; }

  /* Name as the subject of a sentence ("The United States") or mid-sentence ("the United States"). */
  function lead(c) { return THE[c.code] && !/^the /i.test(c.display) ? "The " + c.display : c.display; }
  function mid(c) { return THE[c.code] && !/^the /i.test(c.display) ? "the " + c.display : c.display; }

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Ranks are computed over sovereign countries only (rank: true in live.json). */
  function buildContext(countries) {
    var ranked = countries.filter(function (c) { return c.rank && c.pop > 0; });
    var byPop = ranked.slice().sort(function (a, b) { return b.pop - a.pop; });
    var withArea = ranked.filter(function (c) { return c.area > 0; });
    var byArea = withArea.slice().sort(function (a, b) { return b.area - a.area; });
    var byDens = withArea.slice().sort(function (a, b) { return b.pop / b.area - a.pop / a.area; });
    var rank = {};
    function put(list, key) { list.forEach(function (c, i) { (rank[c.code] = rank[c.code] || {})[key] = i + 1; }); }
    put(byPop, "pop"); put(byArea, "area"); put(byDens, "dens");
    var totalPop = ranked.reduce(function (s, c) { return s + c.pop; }, 0);
    return { ranked: ranked, byPop: byPop, byArea: byArea, byDens: byDens, rank: rank, nPop: byPop.length, nArea: byArea.length, totalPop: totalPop };
  }

  /* "3rd most" from the top half, "2nd least" from the bottom half. */
  function standing(rank, n, most, least) {
    if (rank === 1) return "the " + most;
    if (rank === n) return "the " + least;
    if (rank <= n / 2) return "the " + ordinal(rank) + " " + most;
    return "the " + ordinal(n - rank + 1) + " " + least;
  }

  function neighbourLine(c, list, key, ctx, unitFmt, noun) {
    var r = ctx.rank[c.code] && ctx.rank[c.code][key === "pop" ? "pop" : "area"];
    if (!r) return "";
    var best = null;
    [list[r - 2], list[r]].forEach(function (o) {
      if (!o) return;
      var dist = Math.abs(Math.log(c[key] / o[key]));
      if (!best || dist < best.dist) best = { o: o, dist: dist };
    });
    if (!best || best.dist > Math.log(1.4)) return "";
    return lead(c) + " has " + noun + " close to " + mid(best.o) + "'s (about " + unitFmt(best.o[key]) + ").";
  }

  function computed(c, ctx) {
    var known = [], fun = [], special = [], records = [];
    var r = ctx.rank[c.code] || {};
    var d = lead(c);
    var yr = c.year ? " (" + c.year + ")" : "";
    if (c.pop > 0) {
      if (r.pop) known.push(d + " is " + standing(r.pop, ctx.nPop, "most populous country in the world", "least populous country in the world").replace(/^the (\d+\w+) (most populous country in the world)$/, "the $1 most populous of " + ctx.nPop + " countries").replace(/^the (\d+\w+) (least populous country in the world)$/, "the $1 least populous of " + ctx.nPop + " countries") + ", with about " + fmtPop(c.pop) + " people" + yr + ".");
      else known.push(d + " has about " + fmtPop(c.pop) + " people" + yr + ".");
    }
    if (c.area > 0) {
      if (r.area) {
        var st = standing(r.area, ctx.nArea, "largest country in the world", "smallest country in the world");
        st = st.replace(/^the (\d+\w+) (largest|smallest) country in the world$/, "the $1 $2 of " + ctx.nArea + " countries");
        known.push("Its surface area is about " + fmtArea(c.area) + ", " + st + ".");
      } else known.push("Its surface area is about " + fmtArea(c.area) + ".");
    }
    if (c.capital) known.push("Its capital is " + endSentence(c.capital));

    if (c.pop > 0 && c.area > 0) {
      var dens = c.pop / c.area;
      var dline = d + " has about " + fmtDensity(dens) + " people per square kilometre";
      if (r.dens) dline += ", " + standing(r.dens, ctx.nArea, "most crowded country", "least crowded country");
      fun.push(dline + ".");
      if (r.dens && r.dens > ctx.nArea - 15) special.push(d + " is among the 15 countries with the most room per person, with about " + fmtDensity(dens) + " people per square kilometre.");
      if (r.dens && r.dens <= 15) special.push(d + " is one of the 15 most crowded countries, with about " + fmtDensity(dens) + " people per square kilometre.");
    }
    if (r.pop) { var n1 = neighbourLine(c, ctx.byPop, "pop", ctx, fmtPop, "a population"); if (n1) fun.push(n1); }
    if (r.area) { var n2 = neighbourLine(c, ctx.byArea, "area", ctx, fmtArea, "a surface area"); if (n2) fun.push(n2); }

    if (r.pop === 1) records.push({ text: "Most populous country in the world", src: "World Bank data" });
    else if (r.pop && r.pop <= 10) records.push({ text: "One of the 10 most populous countries (" + ordinal(r.pop) + ")", src: "World Bank data" });
    if (r.pop && r.pop === ctx.nPop) records.push({ text: "Least populous country in the world", src: "World Bank data" });
    else if (r.pop && r.pop > ctx.nPop - 10) special.push(d + " is one of the 10 least populous countries.");
    if (r.area === 1) records.push({ text: "Largest country in the world by area", src: "World Bank data" });
    else if (r.area && r.area <= 10) records.push({ text: "One of the 10 largest countries by area (" + ordinal(r.area) + ")", src: "World Bank data" });
    if (r.area && r.area === ctx.nArea) records.push({ text: "Smallest country in the world by area", src: "World Bank data" });
    else if (r.area && r.area > ctx.nArea - 10) special.push(d + " is one of the 10 smallest countries by area.");
    if (r.dens === 1) records.push({ text: "Most crowded country in the world", src: "World Bank data" });
    if (r.dens === ctx.nArea) records.push({ text: "Least crowded country in the world", src: "World Bank data" });

    special.push(d + " is in " + (GROUP_IN[c.group] || "the world") + ".");
    if (!c.rank) fun.push(d + " is not in the world rankings here, because people around the world do not all agree on how to count it.");
    return { known: known, fun: fun, special: special, records: records };
  }

  function countryFacts(c, ctx, cur, date) {
    cur = cur || {};
    var seed = monthSeed(date || new Date()) + hash(c.code);
    var comp = computed(c, ctx);
    var funList = asList(cur.fun), specialList = asList(cur.special);
    return {
      fun: funList.length ? pick(funList, seed) : pick(comp.fun, seed),
      special: specialList.length ? pick(specialList, seed) : pick(comp.special, seed + 1),
      known: asList(cur.known).concat(comp.known),
      records: asList(cur.records).concat(comp.records),
      curated: !!(cur.fun || cur.special)
    };
  }

  function peopleFacts(p, date) {
    var seed = monthSeed(date || new Date()) + hash(p.n);
    var known = asList(p.known).slice();
    if (!known.length && p.home && p.lang) {
      known = ["Homeland: " + p.home + ".", "Language: " + p.lang + ".", "Population: " + p.pl + "."];
    }
    var f = asList(p.fun), s = asList(p.special);
    return {
      fun: f.length ? pick(f, seed) : "",
      special: s.length ? pick(s, seed + 1) : "",
      known: known,
      records: asList(p.records)
    };
  }

  /* One fact for the top of the page. Changes each month and follows the live numbers. */
  function worldFactOfMonth(ctx, curatedWorld, date) {
    date = date || new Date();
    var out = [];
    if (ctx.byPop.length) {
      var top = ctx.byPop[0];
      out.push(lead(top) + " is the most populous country, with about " + fmtPop(top.pop) + " people.");
      var last = ctx.byPop[ctx.byPop.length - 1];
      out.push("The least populous country on the list is " + mid(last) + ", with about " + fmtPop(last.pop) + " people.");
    }
    if (ctx.byArea.length) {
      out.push(lead(ctx.byArea[0]) + " is the largest country by surface area, at about " + fmtArea(ctx.byArea[0].area) + ".");
      var small = ctx.byArea[ctx.byArea.length - 1];
      out.push(lead(small) + " is the smallest country on the list, at about " + fmtArea(small.area) + ".");
    }
    if (ctx.byDens.length) {
      var dn = ctx.byDens[0];
      out.push(lead(dn) + " is the most crowded country, with about " + fmtDensity(dn.pop / dn.area) + " people per square kilometre.");
    }
    if (ctx.totalPop) out.push("Together the " + ctx.nPop + " countries on this list have about " + fmtPop(ctx.totalPop) + " people.");
    asList(curatedWorld).forEach(function (t) { out.push(t); });
    return { text: pick(out, monthSeed(date)), month: MONTHS[date.getMonth()] + " " + date.getFullYear() };
  }

  function freshness(generatedAt, now) {
    now = now || new Date();
    var gen = new Date(generatedAt);
    var days = Math.floor((now - gen) / 86400000);
    var next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { generated: gen, days: days, stale: days > STALE_AFTER_DAYS, nextRefresh: next };
  }

  /* A language entry shaped like a people entry, so the same page layout works. cur is the hand-written text, data is the CLDR row. */
  function languageRecord(cur, data, countriesByCode) {
    var known = [];
    var total = data && data.speakers ? data.speakers : 0;
    var top = ((data && data.countries) || []).slice(0, 4).map(function (c) { var k = countriesByCode[c.code]; return k ? k.display : ""; }).filter(Boolean);
    if (cur.family) known.push("Language family: " + cur.family + ".");
    if (cur.script) known.push("Writing system: " + cur.script + ".");
    if (total) known.push("Used by about " + fmtPop(total) + " people (an estimate that includes people who speak it as a second language).");
    if (data && data.officialIn) known.push("Official in " + data.officialIn + (data.officialIn === 1 ? " country." : " countries."));
    if (top.length) known.push("Most speakers live in " + top.join(", ") + ".");
    // Languages without hand-written text get a plain summary built from the numbers.
    var auto = !cur.s;
    var summary = cur.s || (cur.n + (total ? " is used by about " + fmtPop(total) + " people" : " is spoken") + (top.length ? ", mostly in " + top.slice(0, 3).join(", ") + "." : "."));
    return {
      id: cur.id, n: cur.n, aka: cur.aka || [], g: "", p: total / 1e6, pl: total ? "about " + fmtPop(total) + " people" : "",
      s: summary, fun: cur.fun, special: cur.special, known: known, family: cur.family || "", script: cur.script || "", auto: auto, records: []
    };
  }

  /* ---- Entries built only from public databases (used by the phone app). ---- */

  /* A language: speakers and countries from Unicode CLDR with World Bank populations, family from Glottolog, writing system from CLDR. */
  function languageEntry(code, d, countriesByCode) {
    var total = d.speakers || 0;
    var top = (d.countries || []).slice(0, 4).map(function (c) { var k = countriesByCode[c.code]; return k ? k.display : ""; }).filter(Boolean);
    var stats = [];
    if (total) stats.push(["Speakers", "about " + fmtPop(total)]);
    if (d.family) stats.push(["Family", d.family]);
    if (d.script) stats.push(["Writing", d.script]);
    var known = [];
    if (total) known.push("The speaker estimate includes people who speak it as a second language.");
    if (d.officialIn) known.push("Official in " + d.officialIn + (d.officialIn === 1 ? " country." : " countries."));
    if (top.length) known.push("Most speakers live in " + top.join(", ") + ".");
    if (d.family === "Language isolate") known.push("A language isolate has no known relatives.");
    return {
      id: code, n: d.name, aka: [], g: "", p: total / 1e6, pl: total ? "about " + fmtPop(total) : "",
      s: d.name + (total ? " is used by about " + fmtPop(total) + " people" : " is spoken") + (top.length ? ", mostly in " + top.slice(0, 3).join(", ") + "." : "."),
      fun: "", special: "", known: known, stats: stats, family: d.family || "", script: d.script || "", records: []
    };
  }

  /* The people of one country. Population, homeland and languages come from the World Bank and Unicode CLDR for that country. */
  function nationalEntry(p, c, langs) {
    var main = (langs || []).slice(0, 3);
    var pop = c.pop || 0;
    var stats = [];
    if (pop) stats.push(["Live in " + c.display, "about " + fmtPop(pop)]);
    stats.push(["Homeland", c.display + (c.capital ? " (capital: " + c.capital + ")" : "")]);
    if (main.length) stats.push(["Main languages", main.map(function (l) { return l.name; }).join(", ")]);
    var known = [];
    if (pop) known.push("The population counts everyone who lives in " + c.display + ", not only one ethnic group.");
    main.forEach(function (l, i) { known.push((i === 0 ? "Most spoken language: " : "Also spoken: ") + l.name + ", about " + fmtPop(l.speakers) + " speakers" + (l.official ? " (official)." : ".")); });
    if (c.group && GROUPS[c.group]) known.push("Region: " + GROUPS[c.group] + ".");
    return {
      id: p.id, code: c.code, n: p.n, g: c.group, p: pop / 1e6, pl: pop ? "about " + fmtPop(pop) : "", home: c.display,
      s: p.n + " are the people of " + c.display + (pop ? ", a country of about " + fmtPop(pop) + " people." : "."),
      fun: "", special: "", known: known, stats: stats, records: []
    };
  }

  /* "Something special" for a country: UNESCO World Heritage Sites (Wikidata). Returns "" when the country has none listed. */
  function heritageSentence(c, h) {
    if (!h || !(h.examples || []).length) return "";
    var ex = (h.examples || []).slice(0, 3);
    var list = ex.length > 1 ? ex.slice(0, -1).join(", ") + " and " + ex[ex.length - 1] : ex[0] || "";
    // No number: Wikidata also lists parts of a site as sites, so a count would be wrong.
    return lead(c) + " is home to UNESCO World Heritage Sites, places the whole world agrees to protect" + (list ? ", like " + list : "") + ".";
  }

  /* A people that is not one country (Kurds, Maya...). Wikidata only. */
  function ethnicEntry(g) {
    var pop = g.population || 0, stats = [];
    if (pop) stats.push(["People", "about " + fmtPop(pop)]);
    if ((g.languages || []).length) stats.push(["Languages", g.languages.join(", ")]);
    return { id: g.id, n: g.n, aka: g.aka || [], g: "", p: pop / 1e6, pl: pop ? "about " + fmtPop(pop) : "", s: "", fun: "", special: "", known: [], stats: stats, records: [], famous: g.famous || [] };
  }

  /* A faith: Pew Research Center figures only. */
  function faithEntry(f) {
    return { id: f.id, n: f.n, aka: f.aka || [], g: "", p: f.p || 0, pl: f.pl || "", s: "", fun: "", special: "", known: [], stats: f.stats || [], records: [] };
  }

  function faithRecord(f) {
    return { id: f.id, n: f.n, aka: f.aka || [], g: "", p: f.p || 0, pl: f.pl, home: f.home, s: f.s, fun: f.fun, special: f.special, known: f.known, records: [] };
  }

  /* Higher score means a better match. 0 means no match. */
  function score(item, q) {
    if (!q) return 1;
    var best = 0;
    var names = [norm(item.name)].concat((item.aka || []).map(norm));
    names.forEach(function (n) {
      if (n === q) best = Math.max(best, 100);
      else if (n.indexOf(q) === 0) best = Math.max(best, 80);
      else if (n.split(" ").some(function (w) { return w.indexOf(q) === 0; })) best = Math.max(best, 60);
      else if (n.indexOf(q) > -1) best = Math.max(best, 40);
    });
    if (best) return best;
    if (item.code && norm(item.code) === q) return 90;
    if (norm(item.body).indexOf(q) > -1) return 10;
    return 0;
  }
  function search(items, query) {
    var q = norm(query);
    return items
      .map(function (it) { return { it: it, s: score(it, q) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.it.name.localeCompare(b.it.name); })
      .map(function (x) { return x.it; });
  }

  return {
    GROUPS: GROUPS, STALE_AFTER_DAYS: STALE_AFTER_DAYS,
    ordinal: ordinal, fmtPop: fmtPop, fmtArea: fmtArea, fmtDensity: fmtDensity, norm: norm,
    buildContext: buildContext, countryFacts: countryFacts, peopleFacts: peopleFacts,
    worldFactOfMonth: worldFactOfMonth, languageRecord: languageRecord, languageEntry: languageEntry, nationalEntry: nationalEntry, ethnicEntry: ethnicEntry, heritageSentence: heritageSentence, faithEntry: faithEntry, faithRecord: faithRecord, freshness: freshness, search: search, monthSeed: monthSeed
  };
});
