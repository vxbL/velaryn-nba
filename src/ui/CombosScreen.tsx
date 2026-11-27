import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlayerStats } from '../api';
import { buildCombos, comboStats, gameLegs, kellyPct, propLegs, valueLegs, type ComboMode, type Leg } from '../edges';
import { fetchKalshiProps, fetchMarkets, kalshiYesProb, type KalshiMarket, type KalshiProp } from '../kalshi';
import { getBets, saveBets, type LockedBet, type LockedLeg } from '../storage';
import { C, pctText, xText } from '../theme';
import { KALSHI_REFRESH_MS, type DayData } from '../useData';
import { OpenButton, Pill, Section, s } from './common';

const money = (n: number) => `$${n.toFixed(2)}`;

const MODE_INFO: Record<ComboMode, { label: string; blurb: string }> = {
  safest: { label: 'SAFEST', blurb: 'Highest chance to hit. Smaller payouts.' },
  value: { label: 'BEST VALUE', blurb: 'Best payout for the risk.' },
  payout: { label: 'BIG PAYOUT', blurb: 'Bigger multipliers. Hits less often.' },
};

export function CombosScreen({ day, players }: { day: DayData | null; players: Record<string, PlayerStats> }) {
  const [props, setProps] = useState<Record<string, KalshiProp[]> | null>(null);
  const [bankroll, setBankroll] = useState('100');
  const [mode, setMode] = useState<ComboMode>('safest');
  const [slip, setSlip] = useState<Leg[]>([]);
  const [bets, setBets] = useState<LockedBet[]>([]);

  useEffect(() => {
    getBets().then(setBets);
  }, []);

  useEffect(() => {
    if (!day) return;
    setProps(null);
    const pre = day.games.filter((g) => g.state === 'pre');
    Promise.all(pre.map((g) => fetchKalshiProps(g).then((p) => [g.id, p] as const).catch(() => [g.id, []] as const))).then((pairs) =>
      setProps(Object.fromEntries(pairs)),
    );
  }, [day?.games.map((g) => g.id).join()]);

  // day.kalshi refreshes every 15s, so legs (prices, multipliers, value) stay live
  const legs = useMemo(() => {
    if (!day) return [];
    const out: Leg[] = [];
    for (const g of day.games) {
      out.push(...gameLegs(g, day.predictions[g.id], day.kalshi[g.id]));
      const sum = day.summaries[g.id];
      const inj = [...(sum?.injuries[g.home.team.id] ?? []), ...(sum?.injuries[g.away.team.id] ?? [])];
      if (props?.[g.id]) out.push(...propLegs(g, props[g.id], players, inj));
    }
    return out;
  }, [day, props, players]);

  const singles = valueLegs(legs, 0.6).sort((a, b) => b.prob - a.prob).slice(0, 15);
  const combos = buildCombos(legs, mode);
  const bank = Math.max(0, parseFloat(bankroll) || 0);

  const updateBets = (next: LockedBet[]) => {
    setBets(next);
    saveBets(next);
  };
  const toggleSlip = (l: Leg) =>
    setSlip((cur) => (cur.some((x) => x.id === l.id) ? cur.filter((x) => x.id !== l.id) : [...cur.filter((x) => x.gameId !== l.gameId), l]));

  if (!day) return <ActivityIndicator color={C.blue} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <MyBets bets={bets} onChange={updateBets} />

      {slip.length > 0 && (
        <BetSlip
          key={slip.map((l) => l.id).join()}
          legs={slip.map((l) => legs.find((x) => x.id === l.id) ?? l)}
          bank={bank}
          onRemove={(l) => toggleSlip(l)}
          onClear={() => setSlip([])}
          onLock={(bet) => {
            updateBets([bet, ...bets]);
            setSlip([]);
          }}
        />
      )}

      <View style={st.warn}>
        <Text style={[s.bold, { color: C.amber, marginBottom: 4 }]}>Read this first</Text>
        <Text style={s.dim}>
          No bet is guaranteed, and a combo only pays if every leg hits. Velaryn lists bets where its chance is better than Kalshi's price, which
          pays off over many bets, not on any single night. Suggested stakes are capped at 5% of your bankroll. Only bet what you're fine losing.
        </Text>
      </View>

      <View style={[s.row, { marginBottom: 14, gap: 10 }]}>
        <Text style={s.bold}>Bankroll $</Text>
        <TextInput value={bankroll} onChangeText={setBankroll} keyboardType="decimal-pad" style={st.input} />
        {props === null && <ActivityIndicator color={C.kalshi} />}
      </View>

      <Section title="Best combos" right={<Text style={[s.dim, { fontSize: 10 }]}>LIVE · {KALSHI_REFRESH_MS / 1000}s</Text>}>
        <View style={[s.row, { gap: 6, marginBottom: 6 }]}>
          {(Object.keys(MODE_INFO) as ComboMode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)}>
              <Pill text={MODE_INFO[m].label} color={mode === m ? C.kalshi : C.faint} />
            </Pressable>
          ))}
        </View>
        <Text style={[s.dim, { marginBottom: 10 }]}>{MODE_INFO[mode].blurb}</Text>
        {combos.length === 0 && <Text style={s.dim}>No combos pass the filters for this day yet. Try another mode, or check back when Kalshi opens more markets.</Text>}
        {combos.map((c, i) => {
          const stake = (bank * c.stakePct) / 100;
          return (
            <View key={i} style={st.combo}>
              <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                <Text style={[s.bold, { fontSize: 16 }]}>
                  {c.legs.length}-leg · {xText(c.multiplier)}
                </Text>
                <Text style={[s.bold, { color: c.prob >= 0.5 ? C.green : C.amber }]}>Hits {pctText(c.prob)}</Text>
              </View>
              {c.legs.map((l) => (
                <Text key={l.id} style={[s.text, { paddingVertical: 2 }]}>
                  • {l.label} <Text style={s.dim}>({l.game}, {pctText(l.prob)})</Text>
                </Text>
              ))}
              <Text style={[s.dim, { marginTop: 6 }]}>
                Suggested {money(stake)} → {money(stake * c.multiplier)} · +{(c.ev * 100).toFixed(1)}% value · loses {pctText(1 - c.prob)} of the time
              </Text>
              <View style={[s.row, { marginTop: 8, gap: 8 }]}>
                <Pressable style={[st.lockBtn, { flex: 1 }]} onPress={() => setSlip(c.legs)}>
                  <Text style={st.lockText}>Load into slip</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </Section>

      <Section title="Best single bets" right={<Pill text="MOST LIKELY FIRST" color={C.faint} />}>
        {singles.length === 0 && <Text style={s.dim}>No value bets right now. Kalshi prices match Velaryn's numbers, or markets haven't opened yet.</Text>}
        {singles.map((l) => {
          const stake = (bank * kellyPct(l.prob, l.multiplier)) / 100;
          const inSlip = slip.some((x) => x.id === l.id);
          return (
            <View key={l.id} style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>{l.label}</Text>
                <Text style={s.dim}>
                  {l.game} · {l.kind} · hits {pctText(l.prob)} · {xText(l.multiplier)}
                </Text>
                <Text style={[s.dim, { color: C.green }]}>
                  Suggested {money(stake)} → {money(stake * l.multiplier)} · +{(l.ev * 100).toFixed(1)}% value
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                <Pressable onPress={() => toggleSlip(l)} style={[st.addBtn, inSlip && { backgroundColor: C.kalshi }]}>
                  <Text style={[st.addText, inSlip && { color: '#000' }]}>{inSlip ? '✓ Slip' : '+ Slip'}</Text>
                </Pressable>
                <OpenButton small label="Kalshi" url={l.url} />
              </View>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

function BetSlip({ legs, bank, onRemove, onClear, onLock }: { legs: Leg[]; bank: number; onRemove: (l: Leg) => void; onClear: () => void; onLock: (b: LockedBet) => void }) {
  const stats = comboStats(legs);
  const suggested = (bank * kellyPct(stats.prob, stats.multiplier)) / 100;
  const [stake, setStake] = useState(suggested > 0 ? suggested.toFixed(2) : '5');
  const [payout, setPayout] = useState('');
  const stakeN = parseFloat(stake) || 0;
  const estPayout = stakeN * stats.multiplier;
  const payoutN = parseFloat(payout) || estPayout;

  const lock = () => {
    if (stakeN <= 0) return Alert.alert('Enter how much you bet');
    const lockedLegs: LockedLeg[] = legs.map((l) => ({
      ticker: l.ticker,
      side: l.side,
      label: l.label,
      game: l.game,
      kind: l.kind,
      entryPrice: l.price,
      prob: l.prob,
      url: l.url,
    }));
    onLock({ id: String(Date.now()), createdAt: new Date().toISOString(), stake: stakeN, payout: payoutN, legs: lockedLegs });
  };

  return (
    <Section title={legs.length === 1 ? 'Bet slip · single' : `Bet slip · ${legs.length}-leg combo`} right={<Pressable onPress={onClear}><Text style={{ color: C.red, fontWeight: '700' }}>Clear</Text></Pressable>}>
      {legs.map((l) => (
        <View key={l.id} style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>{l.label}</Text>
            <Text style={s.dim}>
              {l.game} · {l.side} {Math.round(l.price * 100)}¢ · Velaryn {pctText(l.prob)}
            </Text>
          </View>
          <OpenButton small label="Kalshi" url={l.url} />
          <Pressable onPress={() => onRemove(l)} hitSlop={8}>
            <Text style={{ color: C.faint, fontSize: 18, paddingHorizontal: 4 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Text style={[s.text, { marginTop: 10 }]}>
        Hits <Text style={s.bold}>{pctText(stats.prob)}</Text> · {xText(stats.multiplier)} · {stats.ev >= 0 ? '+' : ''}
        {(stats.ev * 100).toFixed(1)}% value
      </Text>
      <View style={[s.row, { gap: 8, marginTop: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.dim}>You bet $</Text>
          <TextInput value={stake} onChangeText={setStake} keyboardType="decimal-pad" style={st.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.dim}>Kalshi payout $ (optional)</Text>
          <TextInput value={payout} onChangeText={setPayout} keyboardType="decimal-pad" placeholder={estPayout.toFixed(2)} placeholderTextColor={C.faint} style={st.input} />
        </View>
      </View>
      {legs.length > 1 && (
        <Text style={[s.dim, { marginTop: 6 }]}>
          The payout estimate multiplies the leg prices together. If Kalshi's combo quote is different, type the real number so tracking is exact.
        </Text>
      )}
      <Pressable style={[st.lockBtn, { marginTop: 10, backgroundColor: C.kalshi }]} onPress={lock}>
        <Text style={[st.lockText, { color: '#000' }]}>🔒 Lock bet · pays {money(payoutN)}</Text>
      </Pressable>
    </Section>
  );
}

interface LegLive {
  prob: number | null; // live chance this leg hits, from Kalshi
  status: 'open' | 'won' | 'lost';
  bid: number | null;
}

function legLive(l: LockedLeg, m: KalshiMarket | undefined): LegLive {
  if (!m) return { prob: null, status: 'open', bid: null };
  if (m.result) return { prob: null, status: (m.result === 'yes') === (l.side === 'YES') ? 'won' : 'lost', bid: null };
  const yes = kalshiYesProb(m);
  return { prob: yes === null ? null : l.side === 'YES' ? yes : 1 - yes, status: 'open', bid: l.side === 'YES' ? m.yesBid : m.noBid };
}

function MyBets({ bets, onChange }: { bets: LockedBet[]; onChange: (b: LockedBet[]) => void }) {
  const [markets, setMarkets] = useState<Record<string, KalshiMarket>>({});
  const [updated, setUpdated] = useState<Date | null>(null);
  const tickers = bets.flatMap((b) => b.legs.map((l) => l.ticker)).join();

  useEffect(() => {
    if (!tickers) return;
    const load = () =>
      fetchMarkets(tickers.split(','))
        .then((m) => {
          setMarkets(m);
          setUpdated(new Date());
        })
        .catch(() => {});
    load();
    const id = setInterval(load, KALSHI_REFRESH_MS);
    return () => clearInterval(id);
  }, [tickers]);

  if (bets.length === 0) return null;

  let staked = 0;
  let liveValue = 0;
  const rows = bets.map((b) => {
    const live = b.legs.map((l) => legLive(l, markets[l.ticker]));
    const lost = live.some((x) => x.status === 'lost');
    const won = live.every((x) => x.status === 'won');
    const chance = lost ? 0 : won ? 1 : live.reduce((p, x) => p * (x.status === 'won' ? 1 : x.prob ?? NaN), 1);
    // Single bet: what you could sell for right now. Combo: payout x live chance (estimate).
    const value = lost ? 0 : won ? b.payout : b.legs.length === 1 && live[0].bid !== null ? b.payout * live[0].bid : b.payout * chance;
    staked += b.stake;
    liveValue += Number.isFinite(value) ? value : b.stake;
    return { b, live, lost, won, chance, value };
  });
  const pl = liveValue - staked;

  const remove = (id: string) =>
    Alert.alert('Remove this bet?', 'It only removes it from Velaryn, not from Kalshi.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(bets.filter((x) => x.id !== id)) },
    ]);

  return (
    <Section title="My bets" right={<Text style={[s.dim, { fontSize: 10 }]}>{updated ? `LIVE · ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'LOADING'}</Text>}>
      <View style={[s.row, { gap: 8, marginBottom: 10 }]}>
        <Stat label="Staked" value={money(staked)} />
        <Stat label="Worth now" value={money(liveValue)} />
        <Stat label="P/L" value={`${pl >= 0 ? '+' : '-'}${money(Math.abs(pl))}`} color={pl >= 0 ? C.green : C.red} />
      </View>
      {rows.map(({ b, live, lost, won, chance, value }) => (
        <View key={b.id} style={[st.combo, won && { borderColor: C.green, borderWidth: 1 }, lost && { opacity: 0.6 }]}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
            <Text style={s.bold}>
              🔒 {b.legs.length === 1 ? 'Single' : `${b.legs.length}-leg combo`} · {money(b.stake)} → {money(b.payout)}
            </Text>
            <Pressable onPress={() => remove(b.id)} hitSlop={8}>
              <Text style={{ color: C.faint }}>✕</Text>
            </Pressable>
          </View>
          {b.legs.map((l, i) => {
            const x = live[i];
            const icon = x.status === 'won' ? '✅' : x.status === 'lost' ? '❌' : '⏳';
            return (
              <View key={l.ticker + l.side} style={[s.row, { paddingVertical: 3, gap: 6 }]}>
                <Text style={{ width: 20 }}>{icon}</Text>
                <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>
                  {l.label} <Text style={s.dim}>({l.game})</Text>
                </Text>
                <Text style={[s.bold, { color: C.kalshi, fontSize: 13 }]}>{x.status === 'open' && x.prob !== null ? pctText(x.prob) : ''}</Text>
              </View>
            );
          })}
          <Text style={[s.dim, { marginTop: 6, color: won ? C.green : lost ? C.red : C.dim }]}>
            {won
              ? `WON · ${money(b.payout)}`
              : lost
                ? `LOST · -${money(b.stake)}`
                : `Kalshi says ${Number.isFinite(chance) ? pctText(chance) : '—'} to hit · worth ~${money(Number.isFinite(value) ? value : 0)} now`}
          </Text>
        </View>
      ))}
      <Text style={[s.dim, { marginTop: 4 }]}>Live %s are Kalshi's current crowd prices. "Worth now" is an estimate; Kalshi's sell price can differ.</Text>
    </Section>
  );
}

function Stat({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={st.stat}>
      <Text style={{ color, fontSize: 16, fontWeight: '900' }}>{value}</Text>
      <Text style={s.dim}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  warn: { backgroundColor: '#2a2110', borderColor: '#5c4612', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  input: { backgroundColor: C.cardHi, color: C.text, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderColor: C.line, gap: 10 },
  combo: { backgroundColor: C.cardHi, borderRadius: 12, padding: 12, marginBottom: 10 },
  stat: { flex: 1, backgroundColor: C.cardHi, borderRadius: 10, padding: 8, alignItems: 'center' },
  lockBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.kalshi },
  lockText: { color: C.kalshi, fontWeight: '800' },
  addBtn: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: C.kalshi, alignItems: 'center' },
  addText: { color: C.kalshi, fontWeight: '800', fontSize: 12 },
});
