import AsyncStorage from "@react-native-async-storage/async-storage";

// The unlock is a yearly auto-renewing subscription ($2.99 / year).
// This file is the only place that knows about purchases. To go live, connect it to the store
// (RevenueCat's react-native-purchases is the usual way) and keep these three functions.
export const PRICE_LABEL = "$2.99 / year";
export const TRIAL_LABEL = "3-day free trial"; // set up as an introductory offer on the subscription in App Store Connect and Google Play
export const FREE_LOOKS = 3; // entries a visitor can open before the trial screen

// For testing only: builds made with EXPO_PUBLIC_DEV_UNLOCK=1 can unlock without paying.
const DEV = process.env.EXPO_PUBLIC_DEV_UNLOCK === "1";

export async function isUnlocked(): Promise<boolean> {
  if (DEV) return (await AsyncStorage.getItem("dev:unlocked")) === "1";
  return false; // replace with a check of the store entitlement
}

export async function buy(): Promise<{ ok: boolean; message: string }> {
  if (DEV) { await AsyncStorage.setItem("dev:unlocked", "1"); return { ok: true, message: "Unlocked (test build)." }; }
  return { ok: false, message: "Purchases are not switched on yet." };
}

export async function restore(): Promise<{ ok: boolean; message: string }> {
  if (DEV) return { ok: (await AsyncStorage.getItem("dev:unlocked")) === "1", message: "Checked (test build)." };
  return { ok: false, message: "Purchases are not switched on yet." };
}
