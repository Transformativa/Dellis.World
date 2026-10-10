import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY = "favs:v1";
export async function loadFavs(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || "[]"); } catch { return []; }
}
export async function saveFavs(ids: string[]) { try { await AsyncStorage.setItem(KEY, JSON.stringify(ids)); } catch {} }
