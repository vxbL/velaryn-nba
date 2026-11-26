import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Game, GameSide, GameSummary } from '../api';
import { americanToMultiplier } from '../edges';
import { kalshiMultiplier, type KalshiGame } from '../kalshi';
import type { Prediction } from '../model';
import { C, pctText, xText } from '../theme';
import { Logo, Pill, ProbBar } from './common';

interface Props {
  game: Game;
  pred: Prediction;
  summary?: GameSummary;
  kalshi?: KalshiGame;
  favoriteId: string | null;
  onPress: () => void;
}

export function GameCard({ game, pred, summary, kalshi, favoriteId, onPress }: Props) {
  const fav = favoriteId === game.home.team.id || favoriteId === game.away.team.id;
  const odds = summary?.odds ?? game.odds;
  const pickHome = pred.pickTeamId === game.home.team.id;
  const pickProb = pickHome ? pred.homeWinProb : 1 - pred.homeWinProb;
  const pickTeam = pickHome ? game.home.team : game.away.team;

  const row = (side: GameSide, prob: number, ml: number | null) => {
    const k = kalshi?.winner[side.team.id];
    const winner = game.state === 'post' && side.score === Math.max(game.home.score, game.away.score);
    return (
      <View style={st.teamRow}>
        <Logo uri={side.team.logo} size={30} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[st.team, favoriteId === side.team.id && { color: C.amber }]}>
            {favoriteId === side.team.id ? '★ ' : ''}
            {side.team.short}
          </Text>
          <Text style={st.record}>{side.record}</Text>
        </View>
        <View style={st.cols}>
          <Text style={[st.prob, prob >= 0.5 && { color: C.text }]}>{pctText(prob)}</Text>
          <Text style={[st.mult, { color: C.kalshi }]}>{k ? xText(kalshiMultiplier(k.yesAsk)) : '—'}</Text>
          <Text style={st.mult}>{xText(americanToMultiplier(ml))}</Text>
        </View>
        {game.state !== 'pre' && <Text style={[st.score, winner && { color: C.text }]}>{side.score}</Text>}
      </View>
    );
  };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.card, fav && st.fav, pressed && { opacity: 0.8 }]}>
      <View style={st.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {game.state === 'in' && <View style={st.liveDot} />}
          <Text style={[st.status, game.state === 'in' && { color: C.red }]}>
            {game.state === 'pre' ? new Date(game.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : game.detail}
          </Text>
        </View>
        <View style={st.cols}>
          <Text style={st.colHead}>WIN</Text>
          <Text style={[st.colHead, { color: C.kalshi }]}>KALSHI</Text>
          <Text style={st.colHead}>{odds?.provider ? odds.provider.slice(0, 6).toUpperCase() : 'BOOK'}</Text>
        </View>
        {game.state !== 'pre' && <View style={{ width: 40 }} />}
      </View>
      {row(game.away, 1 - pred.homeWinProb, odds?.awayML ?? null)}
      {row(game.home, pred.homeWinProb, odds?.homeML ?? null)}
      <View style={{ marginTop: 10 }}>
        <ProbBar home={pred.homeWinProb} />
      </View>
      {game.state !== 'post' && (
        <View style={st.foot}>
          <Text style={st.pick}>
            {pred.live ? 'Live pick: ' : 'Velaryn pick: '}
            <Text style={{ color: C.text, fontWeight: '800' }}>
              {pickTeam.abbr} {pctText(pickProb)}
            </Text>
          </Text>
          <Pill text={pred.confidence.toUpperCase()} color={pred.confidence === 'Lean' ? C.dim : pred.confidence === 'Solid' ? C.blue : C.green} />
        </View>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  fav: { borderColor: C.amber },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  status: { color: C.dim, fontSize: 12, fontWeight: '700' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.red },
  cols: { flexDirection: 'row', width: 150, justifyContent: 'space-between' },
  colHead: { width: 50, textAlign: 'right', color: C.faint, fontSize: 9, fontWeight: '800' },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  team: { color: C.text, fontSize: 16, fontWeight: '700' },
  record: { color: C.faint, fontSize: 11 },
  prob: { width: 50, textAlign: 'right', color: C.dim, fontSize: 15, fontWeight: '800' },
  mult: { width: 50, textAlign: 'right', color: C.dim, fontSize: 13, fontWeight: '600' },
  score: { width: 40, textAlign: 'right', color: C.dim, fontSize: 20, fontWeight: '800' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  pick: { color: C.dim, fontSize: 13 },
});
