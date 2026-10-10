import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { F, Item, Loaded, loadData, refreshData } from "./src/data";
import { PRICE_LABEL, buy, isUnlocked, restore } from "./src/purchase";
import { loadFavs, saveFavs } from "./src/favs";
import { theme as t } from "./src/theme";

const KINDS = [["all", "All"], ["people", "Peoples"], ["country", "Countries"]] as const;
const now = new Date();

function factsFor(it: Item, L: Loaded) {
  return it.kind === "people"
    ? F.peopleFacts(it.data, now)
    : F.countryFacts(it.data, L.ctx, L.curated.countries?.[it.data.code], now);
}

export default function App() {
  const [L, setL] = useState<Loaded | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const [open, setOpen] = useState<Item | null>(null);
  const [tab, setTab] = useState<"explore" | "roots">("explore");
  const [favs, setFavs] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    (async () => {
      setL(await loadData());
      setFavs(await loadFavs());
      setUnlocked(await isUnlocked());
      if (await refreshData()) setL(await loadData());
    })();
  }, []);

  const rows = useMemo(() => {
    if (!L) return [];
    let pool = L.items.filter((i) => kind === "all" || i.kind === kind);
    if (!q.trim()) {
      pool = kind === "all" ? pool.filter((i) => i.featured) : pool;
      return [...pool].sort((a, b) => a.name.localeCompare(b.name));
    }
    return F.search(pool, q) as Item[];
  }, [L, q, kind]);

  if (!L) return <View style={s.center}><ActivityIndicator color={t.orange} /></View>;

  const toggleFav = (it: Item) => {
    if (!unlocked) return setPaywall(true);
    const next = favs.includes(it.id) ? favs.filter((x) => x !== it.id) : [...favs, it.id];
    setFavs(next); saveFavs(next);
  };
  const wf = F.worldFactOfMonth(L.ctx, L.curated.world, now);

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.brand}>Dellis</Text>
        <Text style={s.title}>All World <Text style={s.hl}>People</Text> Encyclopedia</Text>
      </View>

      {tab === "explore" ? (
        <>
          <View style={s.bar}>
            <TextInput style={s.input} placeholder="Search a people or country" placeholderTextColor="#6b6b6b"
              value={q} onChangeText={setQ} autoCorrect={false} clearButtonMode="while-editing" accessibilityLabel="Search" />
            <View style={s.chips}>
              {KINDS.map(([k, label]) => (
                <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="button" accessibilityState={{ selected: kind === k }}
                  style={[s.chip, kind === k && s.chipOn]}>
                  <Text style={[s.chipTx, kind === k && s.chipTxOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FlatList
            data={rows} keyExtractor={(i) => i.id} keyboardShouldPersistTaps="handled"
            ListHeaderComponent={!q.trim() ? (
              <View style={s.wfm}><Text style={s.lab}>WORLD FACT · {wf.month.toUpperCase()}</Text><Text style={s.body}>{wf.text}</Text></View>
            ) : null}
            ListEmptyComponent={<Text style={s.empty}>Nothing matches that search.</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => setOpen(item)} style={s.row} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{item.name}</Text>
                  <Text style={s.rowSub}>{item.kind === "people" ? "People" : "Country"}{item.popLabel ? " · " + item.popLabel : ""} · {F.GROUPS[item.group]}</Text>
                </View>
                {favs.includes(item.id) ? <Text style={s.star}>★</Text> : null}
              </Pressable>
            )}
          />
        </>
      ) : (
        <Roots L={L} favs={favs} unlocked={unlocked} onUnlock={() => setPaywall(true)} />
      )}

      <View style={s.tabs}>
        {([["explore", "Explore"], ["roots", "My Roots"]] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[s.tabTx, tab === k && s.tabOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open && <Detail it={open} L={L} fav={favs.includes(open.id)} onFav={() => toggleFav(open)} onClose={() => setOpen(null)} />}
      </Modal>
      <Modal visible={paywall} animationType="fade" transparent onRequestClose={() => setPaywall(false)}>
        <Paywall onClose={() => setPaywall(false)} onDone={() => { setUnlocked(true); setPaywall(false); }} />
      </Modal>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={s.sec}><Text style={s.lab}>{label.toUpperCase()}</Text>{children}</View>;
}

function Detail({ it, L, fav, onFav, onClose }: { it: Item; L: Loaded; fav: boolean; onFav: () => void; onClose: () => void }) {
  const f = factsFor(it, L);
  const people: { name: string; desc: string }[] = (it.kind === "country" ? L.famous?.countries?.[it.data.code] : L.famousPeoples?.peoples?.[it.data.id]) || [];
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.dhead}>
        <Pressable onPress={onClose} accessibilityRole="button"><Text style={s.link}>Close</Text></Pressable>
        <Pressable onPress={onFav} accessibilityRole="button" accessibilityLabel={fav ? "Remove from My Roots" : "Add to My Roots"}>
          <Text style={s.link}>{fav ? "★ In My Roots" : "☆ Add to My Roots"}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
        <Text style={s.dtitle}>{it.name}</Text>
        {it.kind === "people" ? <Text style={s.body}>{it.data.s}</Text> : null}
        {f.fun ? <Section label="Fun fact"><Text style={s.body}>{f.fun}</Text></Section> : null}
        {f.special ? <Section label="Something special"><Text style={s.body}>{f.special}</Text></Section> : null}
        {f.known?.length ? <Section label="What the world knows">{f.known.map((k: string, i: number) => <Text key={i} style={s.body}>• {k}</Text>)}</Section> : null}
        {people.length ? <Section label={it.kind === "people" ? "Famous people" : "Famous people from here"}>{people.map((p) => <Text key={p.name} style={s.body}>• {p.name} <Text style={s.muted}>({p.desc})</Text></Text>)}</Section> : null}
        {f.records?.length ? <Section label="Records">{f.records.map((r: any, i: number) => <Text key={i} style={s.body}>• {r.text} <Text style={s.muted}>({r.src})</Text></Text>)}</Section> : null}
        <Section label="Numbers">
          {it.kind === "people"
            ? <Text style={s.body}>Population {it.data.pl}. Homeland: {it.data.home}. Language: {it.data.lang}.</Text>
            : <Text style={s.body}>
                {it.data.pop ? `Population about ${F.fmtPop(it.data.pop)}. ` : ""}{it.data.area ? `Area about ${F.fmtArea(it.data.area)}. ` : ""}
                {it.data.capital ? `Capital: ${it.data.capital}.` : ""}
              </Text>}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Roots({ L, favs, unlocked, onUnlock }: { L: Loaded; favs: string[]; unlocked: boolean; onUnlock: () => void }) {
  if (!unlocked) {
    return (
      <View style={s.pad}>
        <Text style={s.dtitle}>My Roots</Text>
        <Text style={s.body}>Pick the peoples and countries in your family and get one card of fun facts. A for-fun heritage card. It is not a DNA test.</Text>
        <Pressable onPress={onUnlock} style={s.btn} accessibilityRole="button"><Text style={s.btnTx}>Unlock for {PRICE_LABEL}</Text></Pressable>
      </View>
    );
  }
  const items = favs.map((id) => L.items.find((i) => i.id === id)).filter(Boolean) as Item[];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={s.dtitle}>My Roots</Text>
      {!items.length ? <Text style={s.body}>Open any people or country and tap "Add to My Roots". Your card builds here. This is for fun and is not a DNA test.</Text> : null}
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
  const [msg, setMsg] = useState("");
  return (
    <View style={s.scrim}>
      <View style={s.sheet}>
        <Text style={s.dtitle}>Unlock My Roots</Text>
        <Text style={s.body}>Save the peoples and countries in your family and get your own fun-facts card.</Text>
        <Text style={s.body}>{PRICE_LABEL}. Renews each year until you cancel in your phone's subscription settings. Browsing everything stays free.</Text>
        <Pressable style={s.btn} accessibilityRole="button" onPress={async () => { const r = await buy(); setMsg(r.message); if (r.ok) onDone(); }}>
          <Text style={s.btnTx}>Unlock for {PRICE_LABEL}</Text>
        </Pressable>
        <Pressable onPress={async () => { const r = await restore(); setMsg(r.message); if (r.ok) onDone(); }} accessibilityRole="button"><Text style={s.link}>Restore purchase</Text></Pressable>
        {msg ? <Text style={s.muted}>{msg}</Text> : null}
        <Pressable onPress={onClose} accessibilityRole="button"><Text style={s.link}>Not now</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  brand: { color: t.orange, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  title: { color: t.fg, fontSize: 30, lineHeight: 34 },
  hl: { backgroundColor: t.green },
  bar: { padding: 16, gap: 10 },
  input: { borderWidth: 1, borderColor: t.line, borderRadius: t.radius, backgroundColor: t.surface, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: t.fg },
  chips: { flexDirection: "row", gap: 8 },
  chip: { borderWidth: 1.5, borderColor: t.fg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: t.fg },
  chipTx: { color: t.fg, fontWeight: "600" },
  chipTxOn: { color: t.bg },
  wfm: { margin: 16, marginTop: 0, padding: 16, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, gap: 6 },
  lab: { fontSize: 12, letterSpacing: 1, color: t.muted, fontWeight: "700" },
  body: { color: t.fg, fontSize: 17, lineHeight: 25 },
  muted: { color: t.muted, fontSize: 14 },
  empty: { textAlign: "center", color: t.muted, padding: 24 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderColor: t.line },
  rowName: { color: t.fg, fontSize: 18, fontWeight: "600" },
  rowSub: { color: t.muted, fontSize: 14, marginTop: 2 },
  star: { color: t.orange, fontSize: 20 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderColor: t.line, backgroundColor: t.surface },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabTx: { color: t.muted, fontSize: 16, fontWeight: "600" },
  tabOn: { color: t.fg, textDecorationLine: "underline" },
  dhead: { flexDirection: "row", justifyContent: "space-between", padding: 16 },
  link: { color: t.orange, fontSize: 16, fontWeight: "600" },
  dtitle: { color: t.fg, fontSize: 28, lineHeight: 32 },
  sec: { gap: 6 },
  pad: { padding: 16, gap: 14 },
  card: { padding: 16, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, gap: 6 },
  btn: { backgroundColor: t.fg, borderRadius: 999, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  btnTx: { color: t.bg, fontSize: 17, fontWeight: "700" },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: t.bg, padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});
