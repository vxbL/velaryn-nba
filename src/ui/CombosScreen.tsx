import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlayerStats } from '../api';
import { buildCombos, gameLegs, kellyPct, propLegs, valueLegs, type Leg } from '../edges';
import { fetchKalshiProps, type KalshiProp } from '../kalshi';
import { C, pctText, xText } from '../theme';
import type { DayData } from '../useData';
import { OpenButton, Pill, Section, s } from './common';

export function CombosScreen({ day, players }: { day: DayData | null; players: Record<string, PlayerStats> }) {
  const [props, setProps] = useState<Record<string, KalshiProp[]> | null>(null);
  const [bankroll, setBankroll] = useState('100');

  useEffect(() => {
    if (!day) return;
    setProps(null);
    const pre = day.games.filter((g) => g.state === 'pre');
    Promise.all(pre.map((g) => fetchKalshiProps(g).then((p) => [g.id, p] as const).catch(() => [g.id, []] as const))).then((pairs) =>
      setProps(Object.fromEntries(pairs)),
    );
  }, [day?.games.map((g) => g.id).join()]);

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

  const singles = valueLegs(legs, 0.55).slice(0, 12);
  const combos = buildCombos(legs);
  const bank = Math.max(0, parseFloat(bankroll) || 0);
  const money = (n: number) => `$${n.toFixed(2)}`;

  if (!day) return <ActivityIndicator color={C.blue} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <View style={st.warn}>
        <Text style={[s.bold, { color: C.amber, marginBottom: 4 }]}>Read this first</Text>
        <Text style={s.dim}>
          No bet is guaranteed, and a combo only pays if every leg hits. A 3-leg combo of 75% picks still loses more than half the time. Velaryn
          shows bets where its probability beats Kalshi's price, which means they should pay off over many bets, not on any single night. Stakes
          below use a conservative quarter-Kelly size (max 5% of your bankroll per bet). Only bet money you're fine losing.
        </Text>
      </View>

      <View style={[s.row, { marginBottom: 14, gap: 10 }]}>
        <Text style={s.bold}>Bankroll $</Text>
        <TextInput value={bankroll} onChangeText={setBankroll} keyboardType="decimal-pad" style={st.input} placeholderTextColor={C.faint} />
        {props === null && <ActivityIndicator color={C.kalshi} />}
      </View>

      <Section title="Best single bets" right={<Pill text="KALSHI" color={C.kalshi} />}>
        {singles.length === 0 && (
          <Text style={s.dim}>No value bets on this day right now. Kalshi prices match Velaryn's numbers, or markets haven't opened yet. Check back closer to tip-off.</Text>
        )}
        {singles.map((l) => {
          const stake = (bank * kellyPct(l.prob, l.multiplier)) / 100;
          return (
            <View key={l.id} style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>{l.label}</Text>
                <Text style={s.dim}>
                  {l.game} · {l.kind} · hits {pctText(l.prob)} · {xText(l.multiplier)}
                </Text>
                <Text style={[s.dim, { color: C.green }]}>
                  Stake {money(stake)} → pays {money(stake * l.multiplier)} · +{(l.ev * 100).toFixed(1)}% EV
                </Text>
              </View>
              <OpenButton small label="Open Kalshi" url={l.url} />
            </View>
          );
        })}
      </Section>

      <Section title="Value combos" right={<Pill text="DIFFERENT GAMES" color={C.faint} />}>
        {combos.length === 0 && <Text style={s.dim}>Not enough independent value legs to build a combo for this day.</Text>}
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
                <View key={l.id} style={[s.row, { paddingVertical: 4, gap: 8 }]}>
                  <Text style={[s.text, { flex: 1 }]}>
                    {l.label} <Text style={s.dim}>({l.game}, {pctText(l.prob)})</Text>
                  </Text>
                  <OpenButton small label="Kalshi" url={l.url} />
                </View>
              ))}
              <Text style={[s.dim, { marginTop: 6 }]}>
                Stake {money(stake)} → pays {money(stake * c.multiplier)} if all hit · +{(c.ev * 100).toFixed(1)}% EV · loses {pctText(1 - c.prob)} of the time
              </Text>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  warn: { backgroundColor: '#2a2110', borderColor: '#5c4612', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  input: { flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderColor: C.line, gap: 10 },
  combo: { backgroundColor: C.cardHi, borderRadius: 12, padding: 12, marginBottom: 10 },
});
