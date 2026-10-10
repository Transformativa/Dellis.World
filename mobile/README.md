# All World People (mobile app)

The Expo / React Native app for the Dellis encyclopedia. It uses the same fact engine (`facts.js`) and data files as the repo root.

- **Free:** search everything, fun facts, famous people, world fact of the month.
- **Subscription, $2.99 / year with a 3-day free trial (auto-renewing). The app shows the trial screen when it opens and after 3 free looks:** My Favorites, a card of fun facts for the peoples and countries in your family. Not a DNA test.
- **Data:** a copy ships inside the app, so it works offline. On launch it checks `https://transformativa.github.io/Dellis.World/data/` for the newer monthly copy and uses that next time.

## Run it

```
cd mobile
npm install
npm run sync-data     # copy the latest data and facts.js into src/generated/
npx expo start        # scan the QR code with Expo Go on your phone
npm run typecheck
```

Run `npm run sync-data` and commit before every release so the bundled copy is fresh.

## Put it on your Expo account

1. `npm i -g eas-cli` then `eas login`
2. `cd mobile && eas init --id <project id>` links this folder to the existing Expo project `transformativas-team/dellis-world` (copy the project id from the project page) and writes it into app.json
3. Test build for friends and family, which unlocks without paying: `eas build --profile preview --platform all`
4. iPhone testers via TestFlight (unlocks without paying): `eas build --profile testflight --platform ios`, then `eas submit --profile production --platform ios`
5. Store release: `eas build --profile production --platform all`, then `eas submit`

The bundle id is `store.dellis.worldpeople` (change it in `app.json` before the first store build if you want another).

## Before the store release

- **Purchases are not connected yet.** `src/purchase.ts` is the one file to finish. Create an auto-renewing subscription at $2.99 / year in App Store Connect and Google Play Console, connect it (RevenueCat's `react-native-purchases` is the usual way), and keep the three functions `isUnlocked`, `buy`, `restore`. Until then the production build shows "Purchases are not switched on yet". Preview builds use `EXPO_PUBLIC_DEV_UNLOCK=1` so you can test My Favorites.
- **Store rules for subscriptions:** a privacy policy page, a Restore purchase button (already there), and price and renewal wording on the paywall (already there). Apple also needs the terms of use link in the listing.
- **Icon and splash** are the Expo defaults. Replace `assets/icon.png`, `assets/splash-icon.png` and the Android icon files with the Dellis D.
