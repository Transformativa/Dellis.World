# Working rules for this repo

- Before every republish (new TestFlight or Android build, or any push the owner will test), run `npm run release-check` and fix every failure. Look at the pictures in `test/visual/latest` if the look-and-feel step reports a change.
- `test/agreements.test.mjs` lists what the owner has agreed (name World Facts, $2.99/year, 3 free looks, brand colours, wording, sources note, database-only content). Never weaken it to make a change pass. If the owner changes an agreement, update the test in the same commit and say so.
- Everything shown in the phone app must come from a public database listed in README.md. Do not add hand-written facts to the app.
- Tell the owner plainly what changed and what could not be checked.
- It is a kids app. All wording in the app, and every person listed, must be kid friendly (see the kids test in `test/agreements.test.mjs` and `kidFriendlyJobs`/`blockWords` in `data/famous-rules.json`).
