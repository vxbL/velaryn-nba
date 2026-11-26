import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchTeamNextGame, type TeamNextGame } from './src/api';
import { getFavorite, setFavorite } from './src/storage';
import { C } from './src/theme';
import { CombosScreen } from './src/ui/CombosScreen';
import { GameCard } from './src/ui/GameCard';
import { GameDetail } from './src/ui/GameDetail';
import { RecordScreen } from './src/ui/RecordScreen';
import { TeamsScreen } from './src/ui/TeamsScreen';
import { useDay, useLeague } from './src/useData';

type Tab = 'Games' | 'Combos' | 'Teams' | 'Record';
const TABS: Tab[] = ['Games', 'Combos', 'Teams', 'Record'];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('Games');
  const [offset, setOffset] = useState(0);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [favNext, setFavNext] = useState<TeamNextGame | null>(null);

  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  }, [offset]);

  const { league, error: leagueError } = useLeague();
  const { data, loading, error, reload } = useDay(date, league);

  useEffect(() => {
    getFavorite().then(setFavoriteId);
  }, []);
  useEffect(() => {
    if (favoriteId) fetchTeamNextGame(favoriteId).then(setFavNext).catch(() => setFavNext(null));
    else setFavNext(null);
  }, [favoriteId]);

  const chooseFavorite = (id: string | null) => {
    setFavoriteId(id);
    setFavorite(id);
  };

  const games = useMemo(() => {
    const list = [...(data?.games ?? [])];
    const order = { in: 0, pre: 1, post: 2 };
    const isFav = (g: (typeof list)[number]) => g.home.team.id === favoriteId || g.away.team.id === favoriteId;
    return list.sort((a, b) => Number(isFav(b)) - Number(isFav(a)) || order[a.state] - order[b.state] || a.date.localeCompare(b.date));
  }, [data, favoriteId]);

  const open = games.find((g) => g.id === openId);
  const favTeam = favoriteId ? league?.standings[favoriteId]?.team : undefined;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Image source={require('./assets/icon.png')} style={st.icon} />
        <View style={{ flex: 1 }}>
          <Text style={st.brand}>VELARYN</Text>
          <Text style={st.sub}>NBA predictions</Text>
        </View>
        {loading && <ActivityIndicator color={C.blue} />}
      </View>

      {(tab === 'Games' || tab === 'Combos') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.dates} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
          {[-2, -1, 0, 1, 2, 3, 4, 5, 6].map((o) => {
            const d = new Date();
            d.setDate(d.getDate() + o);
            const active = o === offset;
            return (
              <Pressable key={o} onPress={() => setOffset(o)} style={[st.date, active && st.dateActive]}>
                <Text style={[st.dateTop, active && { color: C.text }]}>{o === 0 ? 'TODAY' : d.toLocaleDateString([], { weekday: 'short' }).toUpperCase()}</Text>
                <Text style={[st.dateNum, active && { color: C.text }]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={{ flex: 1 }}>
        {tab === 'Games' && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={C.blue} />}
          >
            {favTeam && favNext && (
              <View style={st.favBanner}>
                <Text style={{ color: C.amber, fontWeight: '800' }}>★ {favTeam.short}</Text>
                <Text style={{ color: C.dim, fontSize: 12 }}>
                  {favNext.state === 'in' ? 'Playing now: ' : 'Next: '}
                  {favNext.name} · {new Date(favNext.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            )}
            {(leagueError || error) && <Text style={st.error}>Couldn't load data: {leagueError ?? error}. Pull down to retry.</Text>}
            {!data && !error && !leagueError && <ActivityIndicator color={C.blue} style={{ marginTop: 40 }} />}
            {data && games.length === 0 && <Text style={st.empty}>No NBA games on this day.</Text>}
            {data &&
              games.map((g, i) => {
                const prev = games[i - 1];
                const heading = g.state === 'in' ? 'LIVE' : g.state === 'pre' ? 'UPCOMING' : 'FINAL';
                const prevHeading = prev ? (prev.state === 'in' ? 'LIVE' : prev.state === 'pre' ? 'UPCOMING' : 'FINAL') : null;
                return (
                  <View key={g.id}>
                    {heading !== prevHeading && <Text style={[st.groupHead, heading === 'LIVE' && { color: C.red }]}>{heading}</Text>}
                    <GameCard
                      game={g}
                      pred={data.predictions[g.id]}
                      summary={data.summaries[g.id]}
                      kalshi={data.kalshi[g.id]}
                      favoriteId={favoriteId}
                      onPress={() => setOpenId(g.id)}
                    />
                  </View>
                );
              })}
          </ScrollView>
        )}
        {tab === 'Combos' && <CombosScreen day={data} players={league?.players ?? {}} />}
        {tab === 'Teams' && league && <TeamsScreen standings={league.standingsList} favoriteId={favoriteId} onFavorite={chooseFavorite} />}
        {tab === 'Record' && <RecordScreen />}
      </View>

      <View style={[st.tabs, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={st.tab}>
            <View style={[st.tabDot, tab === t && { backgroundColor: t === 'Combos' ? C.kalshi : C.blue }]} />
            <Text style={[st.tabText, tab === t && { color: C.text }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {open && data && (
        <GameDetail
          game={open}
          pred={data.predictions[open.id]}
          summary={data.summaries[open.id]}
          kalshi={data.kalshi[open.id]}
          players={league?.players ?? {}}
          onClose={() => setOpenId(null)}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10 },
  brand: { color: C.text, fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  sub: { color: C.dim, fontSize: 12 },
  dates: { flexGrow: 0, marginBottom: 4 },
  date: { width: 54, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  dateActive: { borderColor: C.blue, backgroundColor: '#0f1d40' },
  dateTop: { color: C.faint, fontSize: 10, fontWeight: '800' },
  dateNum: { color: C.dim, fontSize: 17, fontWeight: '800' },
  groupHead: { color: C.faint, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginTop: 8, marginBottom: 8 },
  favBanner: { backgroundColor: '#2a2110', borderColor: '#5c4612', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  error: { color: C.red, marginBottom: 12 },
  empty: { color: C.dim, textAlign: 'center', marginTop: 40 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: '#080a10', paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  tabDot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  tabText: { color: C.faint, fontSize: 12, fontWeight: '800' },
});
