import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// The unlock is a yearly auto-renewing subscription ($3.99 / year), sold through Google Play / the App Store
// and managed by RevenueCat. This file is the only place that knows about purchases.
export const PRICE_LABEL = "$3.99 / year";
export const FREE_LOOKS = 3; // entries a visitor can open before the trial screen

// Public SDK keys are meant to live inside the app (they cannot read or change anything private).
const KEY_ANDROID = "goog_vCbacmUlUcneXFMIeLLMGbOojwU";
const KEY_IOS = "appl_xTCEfYKfnYUGmZUDceIsfsRhiZR";

// For testing only: builds made with EXPO_PUBLIC_DEV_UNLOCK=1 can unlock without paying.
const DEV = process.env.EXPO_PUBLIC_DEV_UNLOCK === "1";

const NOT_READY = "Purchases are not available on this device yet.";
const key = () => (Platform.OS === "android" ? KEY_ANDROID : Platform.OS === "ios" ? KEY_IOS : "");

let ready: Promise<any | null> | null = null;
function rc(): Promise<any | null> {
  if (!key()) return Promise.resolve(null);
  if (!ready) {
    ready = (async () => {
      try {
        const Purchases = require("react-native-purchases").default;
        Purchases.configure({ apiKey: key() });
        return Purchases;
      } catch { return null; }
    })();
  }
  return ready;
}

// Any active entitlement means the yearly subscription is paid and current.
const active = (info: any) => !!info && Object.keys(info.entitlements?.active || {}).length > 0;

export async function isUnlocked(): Promise<boolean> {
  if (DEV) return (await AsyncStorage.getItem("dev:unlocked")) === "1";
  try {
    const P = await rc();
    if (!P) return false;
    return active(await P.getCustomerInfo());
  } catch { return false; }
}

export async function buy(): Promise<{ ok: boolean; message: string }> {
  if (DEV) { await AsyncStorage.setItem("dev:unlocked", "1"); return { ok: true, message: "Unlocked (test build)." }; }
  try {
    const P = await rc();
    if (!P) return { ok: false, message: NOT_READY };
    const offerings = await P.getOfferings();
    const pkg = offerings.current?.annual || offerings.current?.availablePackages?.[0];
    if (!pkg) return { ok: false, message: "The subscription could not be loaded. Please try again later." };
    const { customerInfo } = await P.purchasePackage(pkg);
    return active(customerInfo)
      ? { ok: true, message: "Thank you! World Facts is unlocked." }
      : { ok: false, message: "The purchase did not finish. You have not been charged." };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, message: "Purchase cancelled. You have not been charged." };
    const why = e?.readableErrorCode || e?.code; // short store error name, so a parent can tell us what happened
    return { ok: false, message: "Something went wrong with the purchase. Please try again." + (why ? ` (${why})` : "") };
  }
}

export async function restore(): Promise<{ ok: boolean; message: string }> {
  if (DEV) return { ok: (await AsyncStorage.getItem("dev:unlocked")) === "1", message: "Checked (test build)." };
  try {
    const P = await rc();
    if (!P) return { ok: false, message: NOT_READY };
    const ok = active(await P.restorePurchases());
    return { ok, message: ok ? "Your purchase was restored." : "No earlier purchase was found for this account." };
  } catch { return { ok: false, message: "Could not check for a purchase. Please try again." }; }
}
