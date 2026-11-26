import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, pctText } from '../theme';
import type { LoggedPick } from '../storage';
import { gradeOldPicks } from '../useData';
import { Section, s } from './common';

export function RecordScreen() {
  const [log, setLog] = useState<Record<string, LoggedPick> | null>(null);
  useEffect(() => {
    gradeOldPicks().then(setLog);
  }, []);
  if (!log) return <ActivityIndicator color={C.blue} style={{ marginTop: 40 }} />;

  const graded = Object.values(log)
    .filter((p) => p.result)
    .sort((a, b) => b.date.localeCompare(a.date));
  const wins = graded.filter((p) => p.result === 'W').length;
  const strong = graded.filter((p) => p.prob >= 0.7);
  const strongWins = strong.filter((p) => p.result === 'W').length;
  // Brier score: lower is better; 0.25 = coin flip
  const brier = graded.length ? graded.reduce((sum, p) => sum + (p.result === 'W' ? (1 - p.prob) ** 2 : p.prob ** 2), 0) / graded.length : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <View style={st.stats}>
        <Stat label="Record" value={`${wins}-${graded.length - wins}`} />
        <Stat label="Accuracy" value={graded.length ? pctText(wins / graded.length) : '—'} />
        <Stat label="70%+ picks" value={strong.length ? pctText(strongWins / strong.length) : '—'} />
        <Stat label="Brier" value={brier !== null ? brier.toFixed(3) : '—'} />
      </View>
      <Text style={[s.dim, { marginBottom: 12 }]}>
        Only picks Velaryn made before tip-off are graded. Open the app on game days so it can lock in its picks. Brier score below 0.21 is
        excellent for the NBA.
      </Text>
      <Section title="Graded picks">
        {graded.length === 0 && <Text style={s.dim}>No graded picks yet. Check back after tonight's games.</Text>}
        {graded.slice(0, 100).map((p) => (
          <View key={p.gameId} style={st.row}>
            <Text style={[st.badge, { color: p.result === 'W' ? C.green : C.red }]}>{p.result}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>
                {p.pickAbbr} <Text style={s.dim}>({pctText(p.prob)})</Text>
              </Text>
              <Text style={s.dim}>
                {p.matchup} · {new Date(p.date).toLocaleDateString()}
              </Text>
            </View>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={s.dim}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line, gap: 10 },
  badge: { width: 22, fontWeight: '900', fontSize: 16 },
});
