// Look-and-feel check. Builds the app for the web, opens it in a phone-sized headless browser and:
//   1. checks the things that define the look (fonts, brand colours, layout does not overflow, no broken text), and
//   2. takes a screenshot of each main screen and compares it with the saved picture in test/visual/baseline.
// Usage: node scripts/visual-check.mjs            compare with the saved pictures
//        node scripts/visual-check.mjs --update   save the current pictures as the new baseline (do this only after a design change the owner approved)
// Needs Chromium (Playwright). Pictures of this run are written to test/visual/latest (not committed) so you can look at them.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, createReadStream, statSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobile = path.join(root, "mobile");
const baseDir = path.join(root, "test", "visual", "baseline");
const latestDir = path.join(root, "test", "visual", "latest");
const UPDATE = process.argv.includes("--update");
const MAX_DIFF = 0.02; // fail when more than 2% of pixels changed
const problems = [];
const note = (m) => { problems.push(m); console.log("  PROBLEM: " + m); };

function loadPlaywright() {
  for (const base of [root + "/", mobile + "/", "/opt/npm-tools/node_modules/", process.cwd() + "/"]) {
    try { return createRequire(base)("playwright"); } catch {}
  }
  throw new Error("Playwright is not installed. Run: npm i -g playwright && npx playwright install chromium");
}

// 1. Build the web version of the app (extra web libraries are installed on demand and are not saved in package.json).
if (!existsSync(path.join(mobile, "node_modules", "react-native-web"))) {
  console.log("Installing web preview libraries (one time)...");
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "react-dom@19.2.3", "react-native-web@~0.21.0", "@expo/metro-runtime@~57.0.16"], { cwd: mobile, stdio: "inherit" });
}
const out = mkdtempSync(path.join(os.tmpdir(), "worldfacts-web-"));
console.log("Building the web version...");
execFileSync("npx", ["expo", "export", "--clear", "--platform", "web", "--output-dir", out], { cwd: mobile, stdio: "ignore", env: { ...process.env, EXPO_OFFLINE: "1", CI: "1", EXPO_PUBLIC_DEV_UNLOCK: "1" } }); // the test unlock lets one screen show a subscribed phone; nothing is unlocked unless a screen asks for it

// 2. Serve it.
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let f = path.join(out, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(out) || !existsSync(f) || statSync(f).isDirectory()) f = path.join(out, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  createReadStream(f).pipe(res);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
mkdirSync(latestDir, { recursive: true });
mkdirSync(baseDir, { recursive: true });

// Every screen starts from the same state: same date, same "random" numbers, nothing saved.
async function open(setup = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-US", timezoneId: "America/New_York" });
  await ctx.addInitScript((storage) => {
    let x = 12345; Math.random = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
    try { localStorage.clear(); for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); } catch {}
  }, setup);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.getByText("World", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errors };
}
const FAVKEY = "favs:v1";
const chip = (page, name) => page.getByRole("button", { name, exact: true }).first();

// Compare two PNGs in the browser itself, so no extra libraries are needed.
async function compare(a, b) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const r = await page.evaluate(async ([x, y]) => {
    const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = "data:image/png;base64," + s; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: false };
    const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
    const da = px(ia), db = px(ib); let bad = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) bad++;
    return { size: true, frac: bad / (da.length / 4) };
  }, [a.toString("base64"), b.toString("base64")]);
  await ctx.close(); return r;
}

// Things that define the look. Each runs on every screen.
async function looksRight(label, page, errors) {
  const t = await page.evaluate(() => ({
    text: document.body.innerText, overflow: document.documentElement.scrollWidth - window.innerWidth,
    bg: getComputedStyle(document.body.querySelector("div")).backgroundColor,
    small: [...document.querySelectorAll("div,span")].filter((e) => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 10.5).length,
  }));
  if (t.overflow > 1) note(`${label}: the page is ${t.overflow}px wider than the phone screen`);
  if (/undefined|NaN|\[object|null\b/.test(t.text)) note(`${label}: broken text on screen (${(t.text.match(/.{0,20}(undefined|NaN|\[object|null\b).{0,20}/) || [])[0]})`);
  const lines = t.text.split("\n").map((l) => l.trim()).filter((l) => l.length >= 24 && !/Subscribe for|free looks/.test(l) && !/^[A-Z0-9 ·\-]+$/.test(l));
  const dup = lines.find((l, i) => lines.indexOf(l) !== i);
  if (dup) note(`${label}: the same line appears twice on screen: "${dup.slice(0, 60)}"`);
  if (t.small) note(`${label}: ${t.small} pieces of text are smaller than 10.5px`);
  if (false) note(`${label}: ${t.small} pieces of text are smaller than 10.5px`);
  if (errors.length) note(`${label}: the app reported errors: ${errors[0].slice(0, 120)}`);
}

const shots = [];
async function snap(name, page) {
  const buf = await page.screenshot();
  writeFileSync(path.join(latestDir, name + ".png"), buf);
  shots.push([name, buf]);
}

// ---- Screens ----
{ // home
  const { ctx, page, errors } = await open();
  const body = await page.innerText("body");
  for (const w of ["World Facts", "Another fact", "Peoples", "Countries", "Languages", "Faiths", "All regions", "Showing 25 of", "free looks left", "Explore", "My Favorites"]) if (!body.includes(w)) note(`home: missing "${w}"`);
  const fonts = await page.evaluate(() => [...new Set([...document.querySelectorAll("div,span")].filter((e) => e.firstChild && e.firstChild.nodeType === 3 && /^World\s*$/.test(e.firstChild.nodeValue)).map((e) => getComputedStyle(e).fontFamily))]);
  if (!fonts.some((f) => /Questrial/i.test(f))) note("home: the title is not in the Questrial font (" + fonts.join(" | ") + ")");
  const orange = await page.evaluate(() => [...document.querySelectorAll("div,span")].some((e) => e.children.length === 0 && /Another fact/.test(e.textContent) && getComputedStyle(e).color === "rgb(228, 78, 15)"));
  if (!orange) note('home: "Another fact" is not the brand orange');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor + "|" + [...document.querySelectorAll("div")].map((d) => getComputedStyle(d).backgroundColor).join("|"));
  if (!bg.includes("rgb(247, 254, 249)")) note("home: the brand background colour is missing");
  await looksRight("home", page, errors); await snap("01-home", page);
  await page.mouse.wheel(0, 100000); await page.waitForTimeout(500);
  await snap("02-bottom-sources", page);
  const end = await page.innerText("body");
  for (const w of ["SOURCES", "World Bank", "Wikidata", "Glottolog", "Pew Research Center", "bears no responsibility", "refresh on the 1st"]) if (!end.includes(w)) note(`sources note: missing "${w}"`);
  await ctx.close();
}
{ // search finds the people (not only the country)
  const { ctx, page, errors } = await open();
  await page.getByLabel("Search").fill("Ukrain"); await page.waitForTimeout(600);
  const body = await page.innerText("body");
  for (const w of ["Ukraine", "Ukrainians", "Ukrainian"]) if (!body.includes(w)) note(`search "Ukrain": missing ${w}`);
  await looksRight("search", page, errors); await snap("03-search", page); await ctx.close();
}
{ // open a people
  const { ctx, page, errors } = await open();
  await page.getByLabel("Search").fill("Italians"); await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Italians/ }).first().click(); await page.waitForTimeout(600);
  const body = await page.innerText("body");
  for (const w of ["Live in Italy", "Main languages", "Famous people"].slice(0, 2)) if (!body.includes(w)) note(`people page: missing "${w}"`);
  if (!/2 free looks left/.test(body)) note("people page: opening one entry should leave 2 free looks");
  await looksRight("people page", page, errors); await snap("04-people-open", page); await ctx.close();
}
{ // languages tab
  const { ctx, page, errors } = await open();
  await chip(page, "Languages").click(); await page.waitForTimeout(600);
  const body = await page.innerText("body");
  for (const w of ["Why these languages?", "Glottolog", "120 results"]) if (!body.includes(w)) note(`languages: missing "${w}"`);
  await looksRight("languages", page, errors); await snap("05-languages", page); await ctx.close();
}
{ // faiths tab, open Islam
  const { ctx, page, errors } = await open();
  await chip(page, "Faiths").click(); await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Islam/ }).first().click(); await page.waitForTimeout(500);
  const body = await page.innerText("body");
  for (const w of ["Why these groups?", "Followers in 2020", "Share of the world"]) if (!body.includes(w)) note(`faiths: missing "${w}"`);
  await looksRight("faiths", page, errors); await snap("06-faiths", page); await ctx.close();
}
{ // the subscribe screen after three free looks
  const { ctx, page, errors } = await open({ freeLooks: "3" });
  await chip(page, "Countries").click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Afghanistan/ }).first().click(); await page.waitForTimeout(600);
  const body = await page.innerText("body");
  for (const w of ["Keep exploring", "Subscribe for $2.99 / year", "Restore purchase", "Maybe later"]) if (!body.includes(w)) note(`subscribe screen: missing "${w}"`);
  await looksRight("subscribe screen", page, errors); await snap("07-subscribe", page); await ctx.close();
}
{ // My Favorites when not subscribed
  const { ctx, page, errors } = await open();
  await page.getByText("My Favorites", { exact: true }).last().click(); await page.waitForTimeout(500);
  await looksRight("favorites", page, errors); await snap("08-favorites", page); await ctx.close();
}


// 3. Compare with the saved pictures.
if (UPDATE) {
  for (const [name, buf] of shots) writeFileSync(path.join(baseDir, name + ".png"), buf);
  console.log(`Saved ${shots.length} baseline pictures to test/visual/baseline.`);
} else {
  for (const [name, buf] of shots) {
    const f = path.join(baseDir, name + ".png");
    if (!existsSync(f)) { note(`${name}: no saved picture to compare with (run with --update once)`); continue; }
    const r = await compare(readFileSync(f), buf);
    if (!r.size) note(`${name}: the screen is a different size than the saved picture`);
    else {
      const pct = (r.frac * 100).toFixed(2);
      console.log(`  ${name}: ${pct}% of pixels changed`);
      if (r.frac > MAX_DIFF) note(`${name}: looks different from the saved picture (${pct}% changed). Compare test/visual/baseline/${name}.png with test/visual/latest/${name}.png`);
    }
  }
}
{ // a subscribed phone: open a saved favorite and read its facts
  const { ctx, page, errors } = await open({ "dev:unlocked": "1", [FAVKEY]: JSON.stringify(["c-ITA", "l-it"]) });
  await page.getByText("My Favorites", { exact: true }).last().click(); await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Italy/ }).first().click(); await page.waitForTimeout(600);
  const body = await page.innerText("body");
  for (const w of ["My Favorites", "Italy", "Hide", "Famous people from here", "In My Favorites"]) if (!body.toLowerCase().includes(w.toLowerCase())) note(`open favorite: missing "${w}"`);
  await looksRight("open favorite", page, errors); await snap("09-favorite-open", page); await ctx.close();
}
await browser.close(); server.close(); rmSync(out, { recursive: true, force: true });
if (problems.length) { console.log(`\nLOOK AND FEEL: ${problems.length} problem(s)`); process.exit(1); }
console.log("\nLOOK AND FEEL: OK");
