import { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator, FlatList, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts, Questrial_400Regular } from "@expo-google-fonts/questrial";
import { F, Item, Loaded, loadData, refreshData } from "./src/data";
import { FREE_LOOKS, PRICE_LABEL, buy, isUnlocked, restore } from "./src/purchase";
import { loadFavs, saveFavs } from "./src/favs";
import { theme as t } from "./src/theme";

const KINDS = [["all", "All"], ["people", "Peoples"], ["country", "Countries"], ["language", "Languages"], ["faith", "Faiths"]] as const;
const KIND_LABEL: Record<string, string> = { people: "PEOPLE", country: "COUNTRY", language: "LANGUAGE", faith: "FAITH" };
const KIND_COLOR: Record<string, string> = { language: "#1B9AAA", faith: "#7FA386" };
const REGION_COLOR: Record<string, string> = {
  africa: "#E44E0F", americas: "#3BD60B", asia: "#F2B705", europe: "#232323", mena: "#7FA386", oceania: "#1B9AAA",
};
const now = new Date();
// A different, mixed handful each time the app opens: shuffled with a per-open seed, then spread across kinds.
function pickMix(items: Item[], n: number, seed: number): Item[] {
  let x = seed || 1;
  const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const byKind = new Map<string, Item[]>();
  for (const it of items) byKind.set(it.kind, [...(byKind.get(it.kind) || []), it]);
  const lists = [...byKind.values()].map((l) => l.map((v) => [rnd(), v] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]));
  const out: Item[] = [];
  for (let i = 0; out.length < n && lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length && out.length < n) out.push(l[i]);
  return out;
}

const SIZES = { small: 0.88, medium: 1, large: 1.25 } as const;
type Size = keyof typeof SIZES;
const DISPLAY = "Questrial_400Regular";
const lo = Math.log10(0.0005), hi = Math.log10(1500);
const sizeWidth = (m: number) => Math.max(3, Math.min(100, Math.round(((Math.log10(Math.max(m, 0.0005)) - lo) / (hi - lo)) * 100)));

const Styles = createContext<ReturnType<typeof mk>>(null as any);
const useS = () => useContext(Styles);

function factsFor(it: Item, L: Loaded) {
  return it.kind !== "country"
    ? F.peopleFacts(it.data, now)
    : F.countryFacts(it.data, L.ctx, null, now);
}

/** A different fun fact each time the app opens (and on "Another fact"). */
function randomFact(L: Loaded): { name: string; text: string } {
  for (let n = 0; n < 60; n++) {
    const it = L.items[Math.floor(Math.random() * L.items.length)];
    const f = factsFor(it, L);
    if (f?.fun) return { name: it.name, text: f.fun };
  }
  return { name: "The world", text: F.worldFactOfMonth(L.ctx, [], now).text };
}

export default function App() {
  const [fontsOk] = useFonts({ Questrial_400Regular });
  const [L, setL] = useState<Loaded | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState<"az" | "size">("az");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"explore" | "favs">("explore");
  const [favs, setFavs] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [looks, setLooks] = useState(0);
  const [size, setSize] = useState<Size>("medium");
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [fact, setFact] = useState<{ name: string; text: string } | null>(null);
  const s = useMemo(() => mk(SIZES[size]), [size]);
  const pickSize = (n: Size) => { setSize(n); AsyncStorage.setItem("textSize", n).catch(() => {}); };

  useEffect(() => {
    (async () => {
      const first = await loadData();
      setL(first);
      setFact(randomFact(first));
      setFavs(await loadFavs());
      const u = await isUnlocked();
      setUnlocked(u);
      const n = Number((await AsyncStorage.getItem("freeLooks").catch(() => "0")) || 0);
      setLooks(n);
      const saved = await AsyncStorage.getItem("textSize").catch(() => null);
      if (saved && saved in SIZES) setSize(saved as Size);
      if (await refreshData()) setL(await loadData());
    })();
  }, []);

  const view = useMemo(() => {
    if (!L) return { rows: [] as Item[], featuredOnly: false, totalFeatured: 0, nCountries: 0 };
    const pool = L.items.filter((i) => (kind === "all" || i.kind === kind) && (region === "all" || kind === "language" || kind === "faith" || i.group === region));
    const featuredOnly = !q.trim() && kind === "all";
    const featured = pool.filter((i) => i.featured);
    let rows = featuredOnly ? pickMix(featured, 25, seed) : (F.search(pool, q) as Item[]);
    if (sort === "size") rows = [...rows].sort((a, b) => b.popM - a.popM);
    else if (!q.trim()) rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return { rows, featuredOnly, totalFeatured: featured.length, nCountries: L.items.filter((i) => i.kind === "country").length };
  }, [L, q, kind, region, sort, seed]);

  if (!L || !fontsOk) return <View style={mk(1).center}><ActivityIndicator color={t.orange} /></View>;

  const toggleFav = (it: Item) => {
    if (!unlocked) return setPaywall(true);
    const next = favs.includes(it.id) ? favs.filter((x) => x !== it.id) : [...favs, it.id];
    setFavs(next); saveFavs(next);
  };
  const openRow = (id: string) => {
    if (openId === id) return setOpenId(null);
    if (!unlocked) {
      if (looks >= FREE_LOOKS) return setPaywall(true);
      const n = looks + 1;
      setLooks(n); AsyncStorage.setItem("freeLooks", String(n)).catch(() => {});
    }
    setOpenId(id);
  };
  const random = () => {
    if (!unlocked && looks >= FREE_LOOKS) return setPaywall(true);
    const it = L.items[Math.floor(Math.random() * L.items.length)];
    setQ(""); setKind("all"); setRegion("all"); openRow(it.id);
  };
  let rows = view.rows;
  if (openId && !rows.some((r) => r.id === openId)) {
    const extra = L.items.find((i) => i.id === openId);
    if (extra) rows = [extra, ...rows];
  }
  const count = view.featuredOnly
    ? `Showing ${rows.length} of ${view.totalFeatured}. Tap a button or search to see more.`
    : `${rows.length} ${rows.length === 1 ? "result" : "results"}`;

  const header = (
    <View>
      <View style={s.brandbar}>
        <Pressable onPress={() => Linking.openURL("https://www.dellis.store")} accessibilityRole="link" accessibilityLabel="Dellis, visit dellis.store" style={s.wordmark}>
          <Image source={require("./assets/dellis-mark.png")} style={s.mark} />
          <Image source={require("./assets/dellis-wordmark.png")} style={s.word} resizeMode="contain" />
        </Pressable>
      </View>

      <View style={s.pad}>
        <Text style={s.eyebrow}>Empowering minds, celebrating differences.</Text>
        <Text style={s.title}>World <Text style={{ fontStyle: "italic" }}>Facts</Text></Text>
        <Text style={s.lede}>Search for any people, country, language or faith. All the facts come from trusted sources, listed at the bottom.</Text>
        <LinearGradient colors={["#4CFC0F", "#F7FEF9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.rule} />

        {fact ? (
          <View style={s.wfm}>
            <View style={s.rowBetween}>
              <Text style={s.lab}>WORLD FACT · {fact.name.toUpperCase()}</Text>
              <Pressable onPress={() => setFact(randomFact(L))} accessibilityRole="button" hitSlop={8}><Text style={s.smallLink}>Another fact</Text></Pressable>
            </View>
            <Text style={s.wfmTx}>{fact.text}</Text>
          </View>
        ) : null}

        <TextInput style={s.input} placeholder="Try Italian, Hindi or Islam" placeholderTextColor="#6b6b6b"
          value={q} onChangeText={setQ} autoCorrect={false} clearButtonMode="while-editing" accessibilityLabel="Search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {KINDS.map(([k, label]) => <Chip key={k} on={kind === k} label={label} onPress={() => { setKind(k); if (k === "language" || k === "faith") setRegion("all"); }} />)}
        </ScrollView>
        {kind === "language" || kind === "faith" ? null : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip on={region === "all"} label="All regions" onPress={() => setRegion("all")} />
          {Object.keys(F.GROUPS).map((g) => <Chip key={g} on={region === g} label={F.GROUPS[g]} onPress={() => setRegion(g)} dot={REGION_COLOR[g]} />)}
        </ScrollView>}

        <Text style={s.muted}>{count}</Text>
        {kind === "language" ? (
          <View style={s.note}>
            <Text style={s.noteHead}>Why these languages?</Text>
            <Text style={s.noteTx}>There are about 7,000 languages in the world! These are the 120 that the most people speak. Each one shows how many people speak it, where they live, and its language family. A language family is a group of languages that grew from the same old language.</Text>
          </View>
        ) : null}
        {kind === "people" ? (
          <View style={s.note}>
            <Text style={s.noteHead}>Why these peoples?</Text>
            <Text style={s.noteTx}>Some peoples here are the people of one country, like the Italians in Italy. Others, like the Kurds, live in many countries. Their facts come from public databases.</Text>
          </View>
        ) : null}
        {kind === "faith" ? (
          <View style={s.note}>
            <Text style={s.noteHead}>Why these groups?</Text>
            <Text style={s.noteTx}>These are the biggest groups of people who share a faith, plus people who follow none. The numbers come from a big study by the Pew Research Center. Smaller faiths are counted in "Folk and other".</Text>
          </View>
        ) : null}
        {!unlocked ? (
          <Pressable onPress={() => setPaywall(true)} accessibilityRole="button" style={s.trialBar}>
            <Text style={s.trialTx}>{Math.max(0, FREE_LOOKS - looks)} free {FREE_LOOKS - looks === 1 ? "look" : "looks"} left. <Text style={s.smallLink}>Subscribe for {PRICE_LABEL}</Text></Text>
          </Pressable>
        ) : null}
        <View style={s.tools}>
          <View style={s.sizeRow}>
            {(["small", "medium", "large"] as Size[]).map((n) => (
              <Pressable key={n} onPress={() => pickSize(n)} accessibilityRole="button" accessibilityLabel={n + " text"} accessibilityState={{ selected: size === n }}
                style={[s.sizeBtn, size === n && s.sizeOn]}>
                <Text style={[s.sizeTx, size === n && s.sizeTxOn, { fontSize: n === "small" ? 13 : n === "medium" ? 16 : 21 }]}>A</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setSort(sort === "az" ? "size" : "az")} accessibilityRole="button" hitSlop={6}>
            <Text style={s.smallLink}>{sort === "az" ? "Sort: A to Z" : "Sort: Largest"}</Text>
          </Pressable>
          <Pressable onPress={random} accessibilityRole="button" hitSlop={6}><Text style={s.smallLink}>Random</Text></Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <Styles.Provider value={s}>
      <SafeAreaView style={s.screen}>
        <StatusBar style="dark" />
        {tab === "explore" ? (
          <FlatList
            data={rows} keyExtractor={(i) => i.id} keyboardShouldPersistTaps="handled" extraData={[openId, favs, size]}
            ListHeaderComponent={header}
            ListFooterComponent={
              <View style={s.sources}>
                <Text style={s.srcHead}>SOURCES</Text>
                <Text style={s.srcTx}>
                  Population and area: {L.live?.source || "World Bank Open Data"}{L.live?.populationYear ? ", " + L.live.populationYear : ""}. Figures are rounded and sources differ.
                  {"\n"}Famous people: Wikidata (CC0), ranked by how many Wikipedia languages cover them.
                  {"\n"}Peoples: a people named after a country shows figures for the whole country (World Bank population, Unicode CLDR languages). Other peoples, like the Kurds, show Wikidata figures.
                  {"\n"}Languages: {L.languages?.meta?.source || "Unicode CLDR and Glottolog"}. Speaker numbers are estimates that include second-language speakers. Only the 120 most spoken of about 7,000 languages are listed.
                  {"\n"}Faiths: {L.faiths?.meta?.citation} {L.faiths?.meta?.disclaimer} Figures are for {L.faiths?.meta?.asOf}.
                  {"\n"}Comparisons and records are calculated from the population and area figures above.
                  {"\n"}Numbers refresh on the 1st of each month. Last refreshed {L.live?.generatedAt ? new Date(L.live.generatedAt).toDateString() : "recently"}.
                </Text>
              </View>
            }
            ListEmptyComponent={<Text style={s.empty}>Nothing matches that search. Try a country name, like Italy or Brazil.</Text>}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item, index }) => (
              <View style={[s.listWrap, index === 0 && s.listTop, index === rows.length - 1 && s.listBottom]}>
                <Pressable onPress={() => openRow(item.id)} style={s.row} accessibilityRole="button" accessibilityState={{ expanded: openId === item.id }}>
                  <View style={[s.dot, { backgroundColor: REGION_COLOR[item.group] || KIND_COLOR[item.kind] || t.fg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{item.name}</Text>
                    <Text style={s.rowSub}>{KIND_LABEL[item.kind] + (item.kind === "language" ? " · " + (item.data.family ? String(item.data.family).split(" (")[0].toUpperCase() : "SPEAKER DATA ONLY") : F.GROUPS[item.group] ? " · " + F.GROUPS[item.group].toUpperCase() : "")}</Text>
                  </View>
                  {favs.includes(item.id) ? <Text style={s.star}>★</Text> : null}
                  <Text style={s.pp}>{item.popLabel}</Text>
                </Pressable>
                {openId === item.id ? <Body it={item} L={L} fav={favs.includes(item.id)} onFav={() => toggleFav(item)} /> : null}
              </View>
            )}
          />
        ) : (
          <Favs L={L} favs={favs} unlocked={unlocked} onUnlock={() => setPaywall(true)} />
        )}

        <View style={s.tabs}>
          {([["explore", "Explore"], ["favs", "My Favorites"]] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[s.tabTx, tab === k && s.tabOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Modal visible={paywall} animationType="fade" transparent onRequestClose={() => setPaywall(false)}>
          <Paywall onClose={() => setPaywall(false)} onDone={() => { setUnlocked(true); setPaywall(false); }} />
        </Modal>
      </SafeAreaView>
    </Styles.Provider>
  );
}

function Chip({ on, label, onPress, dot }: { on: boolean; label: string; onPress: () => void; dot?: string }) {
  const s = useS();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn]}>
      {dot ? <View style={[s.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[s.chipTx, on && s.chipTxOn]}>{label}</Text>
    </Pressable>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  const s = useS();
  return <View style={s.fact}><Text style={s.head}>{label.toUpperCase()}</Text>{children}</View>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  const s = useS();
  return <View style={s.bullet}><Text style={s.dotTx}>•</Text><Text style={s.bulletTx}>{children}</Text></View>;
}

function Body({ it, L, fav, onFav }: { it: Item; L: Loaded; fav: boolean; onFav: () => void }) {
  const s = useS();
  const f = factsFor(it, L);
  const people: { name: string; desc: string }[] = it.data.famous || L.famous?.countries?.[it.data.code] || [];
  const d = it.data;
  const stats: [string, string][] = it.kind !== "country"
    ? d.stats || []
    : [
        ["Population", d.pop ? "about " + F.fmtPop(d.pop) + (d.year ? " (" + d.year + ")" : "") : ""],
        ["Surface area", d.area ? "about " + F.fmtArea(d.area) : ""],
        ["Capital", d.capital], ["Region", F.GROUPS[d.group]],
      ];
  return (
    <View style={s.bodyBox}>
      {it.kind !== "country" ? <Text style={s.body}>{d.s}</Text> : null}
      {f.fun ? <Fact label="Fun fact"><Text style={s.body}>{f.fun}</Text></Fact> : null}
      {f.special ? <Fact label="Something special"><Text style={s.body}>{f.special}</Text></Fact> : null}
      {f.known?.length ? <Fact label="What the world knows">{f.known.map((k: string, i: number) => <Bullet key={i}>{k}</Bullet>)}</Fact> : null}
      {f.records?.length ? <Fact label="Records">{f.records.map((r: any, i: number) => <Bullet key={i}>{r.text} <Text style={s.dim}>({r.src})</Text></Bullet>)}</Fact> : null}
      {people.length ? (
        <Fact label={it.kind === "people" ? "Famous people" : "Famous people from here"}>
          {people.map((p) => <Bullet key={p.name}>{p.name} <Text style={s.dim}>({p.desc})</Text></Bullet>)}
        </Fact>
      ) : null}
      {it.popM > 0 ? <View style={s.meter}><View style={[s.meterFill, { width: `${sizeWidth(it.popM)}%`, backgroundColor: REGION_COLOR[it.group] || t.fg }]} /></View> : null}
      <View style={s.dl}>
        {stats.filter((r) => r[1]).map(([k, v]) => (
          <View key={k} style={s.dlRow}><Text style={s.dt}>{k}</Text><Text style={s.dd}>{v}</Text></View>
        ))}
      </View>
      <Pressable onPress={onFav} style={s.favBtn} accessibilityRole="button" accessibilityLabel={fav ? "Remove from My Favorites" : "Add to My Favorites"}>
        <Text style={s.favBtnTx}>{fav ? "★  In My Favorites" : "☆  Add to My Favorites"}</Text>
      </Pressable>
    </View>
  );
}

function Favs({ L, favs, unlocked, onUnlock }: { L: Loaded; favs: string[]; unlocked: boolean; onUnlock: () => void }) {
  const s = useS();
  if (!unlocked) {
    return (
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h2}>My Favorites</Text>
        <Text style={s.body}>Subscribe to unlock everything: every people, country, language and faith, and your own favorites card.</Text>
        <Pressable onPress={onUnlock} style={s.btn} accessibilityRole="button"><Text style={s.btnTx}>Subscribe for {PRICE_LABEL}</Text></Pressable>
      </ScrollView>
    );
  }
  const items = favs.map((id) => L.items.find((i) => i.id === id)).filter(Boolean) as Item[];
  return (
    <ScrollView contentContainerStyle={[s.pad, { gap: 14 }]}>
      <Text style={s.h2}>My Favorites</Text>
      {!items.length ? <Text style={s.body}>Open anything and tap "Add to My Favorites". Your card builds here.</Text> : null}
      {items.map((it) => (
        <View key={it.id} style={s.card}>
          <Text style={s.rowName}>{it.name}</Text>
          <Text style={s.body}>{factsFor(it, L).fun}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Paywall({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const s = useS();
  const [msg, setMsg] = useState("");
  return (
    <View style={s.scrim}>
      <View style={s.sheet}>
        <Text style={s.h2}>Keep exploring</Text>
        <Text style={s.body}>Every people, country, language and faith, famous people, records, and My Favorites. No ads.</Text>
        <Text style={s.body}>You have used your free looks. Ask a parent or guardian to subscribe for {PRICE_LABEL}. It renews each year until it is cancelled, and a parent can cancel any time in the phone's subscription settings.</Text>
        <Pressable style={s.btn} accessibilityRole="button" onPress={async () => { const r = await buy(); setMsg(r.message); if (r.ok) onDone(); }}>
          <Text style={s.btnTx}>Subscribe for {PRICE_LABEL}</Text>
        </Pressable>
        <Pressable onPress={async () => { const r = await restore(); setMsg(r.message); if (r.ok) onDone(); }} accessibilityRole="button"><Text style={s.link}>Restore purchase</Text></Pressable>
        {msg ? <Text style={s.muted}>{msg}</Text> : null}
        <Pressable onPress={onClose} accessibilityRole="button"><Text style={s.muted}>Maybe later</Text></Pressable>
      </View>
    </View>
  );
}

const mk = (z: number) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  pad: { padding: 16, gap: 14 },
  brandbar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderColor: t.line },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: { width: 40, height: 40 },
  word: { width: 91, height: 40 },
  eyebrow: { fontFamily: DISPLAY, color: t.muted, fontSize: 15 * z },
  title: { fontFamily: DISPLAY, color: t.fg, fontSize: 38 * z, lineHeight: 41 * z, letterSpacing: -0.7 },
  lede: { color: t.muted, fontSize: 17 * z, lineHeight: 25 * z },
  rule: { height: 6, borderRadius: 99 },
  wfm: {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: t.radius, padding: 16, gap: 8,
    shadowColor: t.green, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 2,
  },
  wfmTx: { fontFamily: DISPLAY, color: t.fg, fontSize: 20 * z, lineHeight: 26 * z },
  lab: { fontSize: 12 * z, letterSpacing: 1.2, color: t.muted, fontWeight: "700", flexShrink: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  smallLink: { color: t.orange, fontSize: 15 * z, fontWeight: "700" },
  input: { borderWidth: 2, borderColor: t.line, borderRadius: 999, backgroundColor: t.surface, paddingHorizontal: 20, minHeight: 48, fontSize: 17 * z, color: t.fg },
  chips: { flexDirection: "row", gap: 8, paddingRight: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderColor: t.line, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  chipOn: { backgroundColor: t.fg, borderColor: t.fg },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipTx: { color: t.fg, fontWeight: "700", fontSize: 15 * z },
  chipTxOn: { color: t.bg },
  muted: { color: t.muted, fontSize: 15 * z },
  note: { marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: "#fff", gap: 4 },
  noteHead: { color: t.orange, fontSize: 13 * z, fontWeight: "700", letterSpacing: 0.4 },
  noteTx: { color: t.fg, fontSize: 14 * z, lineHeight: 21 * z },
  sources: { marginHorizontal: 16, marginTop: 20, gap: 6 },
  srcHead: { color: t.muted, fontSize: 11 * z, letterSpacing: 1.2, fontWeight: "700" },
  srcTx: { color: t.muted, fontSize: 12 * z, lineHeight: 18 * z },
  trialBar: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: t.radius, padding: 12 },
  trialTx: { color: t.fg, fontSize: 15 * z, lineHeight: 22 * z },
  tools: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sizeBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: t.line },
  sizeOn: { backgroundColor: t.fg, borderColor: t.fg },
  sizeTx: { fontFamily: DISPLAY, color: t.fg, textAlign: "center", includeFontPadding: false, textAlignVertical: "center", lineHeight: 24 },
  sizeTxOn: { color: t.bg },
  empty: { textAlign: "center", color: t.muted, padding: 28, fontSize: 16 * z },
  listWrap: { backgroundColor: t.surface, marginHorizontal: 16, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: t.line },
  listTop: { borderTopWidth: 1, borderTopLeftRadius: t.radius, borderTopRightRadius: t.radius },
  listBottom: { borderBottomLeftRadius: t.radius, borderBottomRightRadius: t.radius },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { fontFamily: DISPLAY, color: t.fg, fontSize: 20 * z, lineHeight: 24 * z },
  rowSub: { color: t.muted, fontSize: 12 * z, letterSpacing: 0.7, marginTop: 2 },
  pp: { color: t.fg, fontSize: 14 * z, fontWeight: "700", textAlign: "right" },
  star: { color: t.orange, fontSize: 18 * z },
  bodyBox: { paddingLeft: 38, paddingRight: 16, paddingBottom: 20, gap: 20 },
  body: { color: t.fg, fontSize: 16 * z, lineHeight: 24 * z },
  dim: { color: t.muted },
  head: { color: t.orange, fontSize: 13 * z, lineHeight: 18 * z, letterSpacing: 1.4, fontWeight: "700" },
  fact: { gap: 8 },
  bullet: { flexDirection: "row", gap: 10 },
  dotTx: { color: t.orange, fontSize: 16 * z, lineHeight: 24 * z, width: 10 },
  bulletTx: { flex: 1, color: t.fg, fontSize: 16 * z, lineHeight: 24 * z },
  meter: { height: 6, backgroundColor: t.line, borderRadius: 99, overflow: "hidden" },
  meterFill: { height: "100%" },
  dl: { gap: 6 },
  dlRow: { flexDirection: "row", gap: 14 },
  dt: { color: t.muted, fontSize: 15 * z, lineHeight: 22 * z, width: 132 },
  dd: { color: t.fg, fontSize: 15 * z, lineHeight: 22 * z, flex: 1 },
  favBtn: { alignSelf: "flex-start", borderWidth: 2, borderColor: t.fg, borderRadius: 999, minHeight: 44, paddingHorizontal: 18, justifyContent: "center" },
  favBtnTx: { color: t.fg, fontWeight: "700", fontSize: 15 * z },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderColor: t.line, backgroundColor: t.surface },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabTx: { color: t.muted, fontSize: 16 * z, fontWeight: "600" },
  tabOn: { color: t.fg, textDecorationLine: "underline" },
  link: { color: t.orange, fontSize: 16 * z, fontWeight: "600" },
  h2: { fontFamily: DISPLAY, color: t.fg, fontSize: 30 * z, lineHeight: 34 * z },
  card: { padding: 16, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, gap: 6 },
  btn: { backgroundColor: t.fg, borderRadius: 999, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  btnTx: { color: t.bg, fontSize: 17 * z, fontWeight: "700" },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: t.bg, padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});
