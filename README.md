# Dellis World

**All World People Encyclopedia**, a Dellis app. Search any people or country and get a fun fact, something special, what the world knows about it, and records.

The encyclopedia is the paid mobile app (`app.html` is its working copy, with `facts.js` and the data files). The public website is only the **Danny's Apps** download page (`index.html` and `apps.json`). The data files are still published as JSON so the app can pick up each monthly refresh. No build step and no dependencies.

## How the facts work

Every entry, including all 219 countries, gets four things. Countries also get a fifth: the five best-known people from there.

| Part | Where it comes from |
| --- | --- |
| Fun fact | Hand-written in `data/peoples.json` or `data/curated.json` if one exists. Otherwise worked out from the live numbers (population density, a country with a similar size, and so on) and rotated each month. |
| Something special | Same rule. |
| What the world knows | Hand-written facts, plus facts worked out from the live numbers: population and area rankings, capital, income level. |
| Records | Hand-written records with a named source, plus rankings that are true right now (most populous, largest, most densely populated, and so on). |
| Famous people | The five people with the most Wikipedia language editions, from Wikidata (free, CC0). Filtered by `data/famous-rules.json`. |

`facts.js` holds that logic. It has no page code in it, so the same file runs in the browser and in the tests.

The page also shows a **World fact of the month** at the top. It picks from the live rankings and a list of evergreen facts in `data/curated.json`, and changes on the 1st of each month.

## Monthly refresh

`.github/workflows/refresh-monthly.yml` runs at 05:17 UTC on the 1st of every month. It:

1. runs `scripts/refresh.mjs`, which pulls population, area, capitals and income groups from the [World Bank Open Data API](https://data.worldbank.org/) and rewrites `data/live.json`,
2. runs `scripts/refresh-famous.mjs`, which asks Wikidata for each country's best-known people and rewrites `data/famous.json` (this step takes up to an hour and is allowed to fail without stopping the rest),
3. runs the tests against the new data,
4. commits `data/live.json` and `data/famous.json` if they changed,
5. opens an issue if anything failed.

If the download looks wrong (fewer than 200 countries, a world population total that does not add up, a missing major country), the script exits with an error and leaves the old file in place.

The refresh updates the numbers, so every ranking, density figure and "most populous / largest" fact moves with them. The page reads `generatedAt` from `data/live.json`. If that is more than 40 days old, it shows a warning that the monthly refresh may not have run.

To refresh by hand, use **Actions → Refresh world facts → Run workflow**, or run `npm run refresh` locally.

### What the refresh does not update

- **Hand-written facts and records.** Records in `data/curated.json` and `data/peoples.json` are not refreshed automatically. Each record carries a `src` field (for example `Widely cited`). The app does not use Guinness World Records, which are licensed. Review these entries now and then.
- **Famous people rules.** `data/famous-rules.json` lists words that keep someone out (dictators, criminals and so on), names to exclude, and names to pin first. Check the list each month; ranking by Wikipedia coverage is a good guide, not a judge of character.
- **Vatican City and Taiwan.** They are not in the World Bank feed, so they live in `data/extra-countries.json` and need a manual check each year.
- **Area corrections.** `data/aliases.json` has an `areaFixes` list for places where the World Bank area disagrees with national statistics (Canada and Monaco at the moment).

## Run it locally

```
npm run serve      # then open http://localhost:8000
npm test           # 17 tests
npm run refresh    # fetch fresh numbers (needs internet)
```

Opening `app.html` or `index.html` straight from disk will not work, because the browser blocks `fetch` for local files. Use the server above.

## Publish with GitHub Pages

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` deploys the site, and deploys it again after every successful monthly refresh.
3. If the monthly refresh cannot push, go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**.

## Files

```
index.html                  Danny's Apps download page (public site)
apps.json                   the apps on that page: price, status, store links
app.html                    the encyclopedia app (brand bar, search, fact panels). Not published.
scripts/make-qr.mjs         makes assets/qr.svg from the site URL in apps.json
facts.js                    the fact engine
data/live.json              country numbers, rewritten monthly by the refresh job
data/famous.json            top five people per country, rewritten monthly
data/famous-rules.json      who is allowed in that list
data/curated.json           hand-written country facts, records, and the world fact list
data/peoples.json           the 36 peoples, with fun facts and records
data/aliases.json           display names, search nicknames, region groups, area corrections
data/extra-countries.json   countries missing from the World Bank feed
scripts/refresh.mjs         the monthly refresh
scripts/refresh-famous.mjs  the monthly famous-people refresh (Wikidata)
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

## Danny's Apps page

Edit `apps.json`. When an app is in the stores, paste its App Store and Google Play links and set `status` to `live`. The buttons turn on and the "coming soon" line disappears. Phones see their own store first. Computers see a QR code. If the site address changes (for example to apps.dellis.store), update `siteUrl` and run `node scripts/make-qr.mjs`.

## Checking everything before a release

```
npm run check         # data + search tests, source freshness, app type check (about 30 seconds)
npm run check:full    # the same, plus a full iOS and Android bundle build (about 2 minutes)
```

If someone reports a search that finds nothing (for example a nationality), add it to `NATIONALITIES` in `test/search-coverage.test.mjs`.

## Where everything in the phone app comes from

Nothing shown in the phone app is hand-written. Every line comes from a public database:

| Shown | Database | Refreshed |
|---|---|---|
| Country population, area, capital, region, income | World Bank Open Data | Monthly |
| Famous people (countries and peoples) | Wikidata (CC0) | Monthly |
| Languages: speakers, countries, names, writing system | Unicode CLDR | Monthly |
| Languages: family | Glottolog (CC BY 4.0) | Monthly |
| Faiths: followers, share, change | Pew Research Center (2020 report, typed in once) | Checked yearly |
| Comparisons and records | Calculated from the World Bank numbers | Monthly |

A "people" is the people of one country (list in `data/peoples-countries.json`), so it shows that country's figures. Peoples that do not match one country (Kurds, Roma, Maya...) are not shown until there is a database to source them from. The older hand-written files (`data/peoples.json`, `data/curated.json` and others) are used only by the unpublished web page `app.html`.
