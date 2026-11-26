import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TeamStanding } from '../api';
import { fmt } from '../model';
import { C } from '../theme';
import { Logo, Section, s } from './common';

interface Props {
  standings: TeamStanding[];
  favoriteId: string | null;
  onFavorite: (teamId: string | null) => void;
}

export function TeamsScreen({ standings, favoriteId, onFavorite }: Props) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[s.dim, { marginBottom: 12 }]}>Tap a team to make it your favorite. Its games get pinned to the top and highlighted.</Text>
      {(['East', 'West'] as const).map((conf) => (
        <Section key={conf} title={`${conf}ern Conference`}>
          <View style={st.head}>
            <Text style={[st.h, { flex: 1, textAlign: 'left' }]}>TEAM</Text>
            {['W-L', 'NET', 'L10', 'STRK'].map((h) => (
              <Text key={h} style={st.h}>
                {h}
              </Text>
            ))}
          </View>
          {standings
            .filter((t) => t.conference === conf)
            .map((t) => {
              const fav = t.team.id === favoriteId;
              return (
                <Pressable key={t.team.id} onPress={() => onFavorite(fav ? null : t.team.id)} style={[st.row, fav && { backgroundColor: '#2a2110' }]}>
                  <Text style={[st.seed, fav && { color: C.amber }]}>{fav ? '★' : t.seed}</Text>
                  <Logo uri={t.team.logo} size={22} />
                  <Text style={[s.bold, { flex: 1, marginLeft: 8 }]} numberOfLines={1}>
                    {t.team.short}
                  </Text>
                  <Text style={st.c}>
                    {t.wins}-{t.losses}
                  </Text>
                  <Text style={[st.c, { color: t.net >= 0 ? C.green : C.red }]}>{fmt(t.net)}</Text>
                  <Text style={st.c}>{t.last10.join('-')}</Text>
                  <Text style={st.c}>{t.streak}</Text>
                </Pressable>
              );
            })}
        </Section>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', paddingLeft: 52, marginBottom: 4 },
  h: { width: 48, textAlign: 'right', color: C.faint, fontSize: 10, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderColor: C.line, borderRadius: 6 },
  seed: { width: 22, color: C.faint, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  c: { width: 48, textAlign: 'right', color: C.dim, fontSize: 13 },
});
