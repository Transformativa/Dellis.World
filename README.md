# Dellis World

**All World People Encyclopedia**, a Dellis app. Search any people or country and get a fun fact, something special, what the world knows about it, and records.

It is a static site: `index.html`, `facts.js` and three data files. No build step and no dependencies.

## How the facts work

Every entry, including all 219 countries, gets four things.

| Part | Where it comes from |
| --- | --- |
| Fun fact | Hand-written in `data/peoples.json` or `data/curated.json` if one exists. Otherwise worked out from the live numbers (population density, a country with a similar size, and so on) and rotated each month. |
| Something special | Same rule. |
| What the world knows | Hand-written facts, plus facts worked out from the live numbers: population and area rankings, capital, income level. |
| Records | Hand-written records with a named source, plus rankings that are true right now (most populous, largest, most densely populated, and so on). |

`facts.js` holds that logic. It has no page code in it, so the same file runs in the browser and in the tests.

The page also shows a **World fact of the month** at the top. It picks from the live rankings and a list of evergreen facts in `data/curated.json`, and changes on the 1st of each month.

## Monthly refresh

`.github/workflows/refresh-monthly.yml` runs at 05:17 UTC on the 1st of every month. It:

1. runs `scripts/refresh.mjs`, which pulls population, area, capitals and income groups from the [World Bank Open Data API](https://data.worldbank.org/) and rewrites `data/live.json`,
2. runs the tests against the new data,
3. commits `data/live.json` if it changed,
4. opens an issue if anything failed.

If the download looks wrong (fewer than 200 countries, a world population total that does not add up, a missing major country), the script exits with an error and leaves the old file in place.

The refresh updates the numbers, so every ranking, density figure and "most populous / largest" fact moves with them. The page reads `generatedAt` from `data/live.json`. If that is more than 40 days old, it shows a warning that the monthly refresh may not have run.

To refresh by hand, use **Actions → Refresh world facts → Run workflow**, or run `npm run refresh` locally.

### What the refresh does not update

- **Hand-written facts and records.** The Guinness World Records site has no open data feed, so records in `data/curated.json` and `data/peoples.json` are not refreshed automatically. Each record carries a `src` field. Use `Guinness World Records` only for records Guinness itself recognises, and review these entries now and then.
- **Vatican City and Taiwan.** They are not in the World Bank feed, so they live in `data/extra-countries.json` and need a manual check each year.
- **Area corrections.** `data/aliases.json` has an `areaFixes` list for places where the World Bank area disagrees with national statistics (Canada and Monaco at the moment).

## Run it locally

```
npm run serve      # then open http://localhost:8000
npm test           # 14 tests
npm run refresh    # fetch fresh numbers (needs internet)
```

Opening `index.html` straight from disk will not work, because the browser blocks `fetch` for local files. Use the server above.

## Publish with GitHub Pages

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` deploys the site, and deploys it again after every successful monthly refresh.
3. If the monthly refresh cannot push, go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**.

## Files

```
index.html                  the app (Dellis brand bar, search, fact panels)
facts.js                    the fact engine
data/live.json              country numbers, rewritten monthly by the refresh job
data/curated.json           hand-written country facts, records, and the world fact list
data/peoples.json           the 36 peoples, with fun facts and records
data/aliases.json           display names, search nicknames, region groups, area corrections
data/extra-countries.json   countries missing from the World Bank feed
scripts/refresh.mjs         the monthly refresh
scripts/lib/normalize.mjs   turns raw World Bank rows into live.json records, and checks them
scripts/seed/               the first saved snapshot
test/                       node:test suites
```

## Adding or editing facts

- **A country:** add an entry to `data/curated.json` under its three-letter code (see `data/live.json` for codes). Provide `fun`, `special`, and optionally `known` and `records`. `fun` and `special` can be a single sentence or a list. A list rotates monthly.
- **A people:** add an object to `data/peoples.json` with `n`, `g` (africa, americas, asia, europe, mena or oceania), `p` (population in millions), `pl`, `home`, `lang`, `s`, `fun`, `special` and `records`. The `id` is the name in lower case with dashes.
- **A search nickname:** add it to the `aka` list in `data/aliases.json`.

Run `npm test` after any change. The tests check that every country and every people has all four parts, that record sources are named, and that curated codes exist.

## Data notes

- Population and area are World Bank figures, rounded when shown. Sources disagree, and who counts as a member of a people is itself debated.
- The World Bank leaves the capital blank for Israel, Hong Kong, Macao, Gibraltar, the Channel Islands and the West Bank and Gaza. The app shows no capital for them instead of choosing one.
- Rankings count 194 sovereign countries. Territories, Kosovo, the Palestinian territories and Taiwan are shown with their numbers but are left out of rankings, to avoid taking a position on contested status.
- Regions are Dellis groupings, not World Bank regions. Central Asia is in Asia, and the Caucasus and Turkey are in the Middle East. `groupOverrides` in `data/aliases.json` controls this.

## Brand

Colors, type and shapes follow [dellis.store](https://www.dellis.store): mint-white background, near-black text, neon green and coral accents, Questrial headings, pill buttons and 14px corners.
