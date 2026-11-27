import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Game, GameSide, GameSummary } from '../api';
import { americanToMultiplier } from '../edges';
import { kalshiMultiplier, kalshiYesProb, type KalshiGame } from '../kalshi';
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

const TIERS = ['Lean', 'Solid', 'Strong', 'Lock'];

export function GameCard({ game, pred, summary, kalshi, favoriteId, onPress }: Props) {
  const fav = favoriteId === game.home.team.id || favoriteId === game.away.team.id;
  const odds = summary?.odds ?? game.odds;
  const pickHome = pred.pickTeamId === game.home.team.id;
  const pickProb = pickHome ? pred.homeWinProb : 1 - pred.homeWinProb;
  const pickTeam = pickHome ? game.home.team : game.away.team;
  const book = odds?.provider ?? 'Book';

  const teamRow = (side: GameSide, prob: number) => {
    const isFav = favoriteId === side.team.id;
    const winner = game.state === 'post' && side.score === Math.max(game.home.score, game.away.score);
    const picked = pred.pickTeamId === side.team.id && game.state !== 'post';
    return (
      <View style={st.teamRow}>
        <Logo uri={side.team.logo} size={38} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[st.team, isFav && { color: C.amber }]} numberOfLines={1}>
            {isFav ? '★ ' : ''}
            {side.team.short}
          </Text>
          <Text style={st.record}>{side.record}</Text>
        </View>
        {game.state !== 'pre' && <Text style={[st.score, winner && { color: C.text }]}>{side.score}</Text>}
        <Text style={[st.prob, picked && { color: C.text }]}>{pctText(prob)}</Text>
      </View>
    );
  };

  const oddsBox = (side: GameSide, ml: number | null) => {
    const k = kalshi?.winner[side.team.id];
    const kp = k ? kalshiYesProb(k) : null;
    return (
      <View style={st.oddsBox}>
        <Text style={st.oddsTeam}>{side.team.abbr}</Text>
        <View style={st.oddsLine}>
          <Text style={[st.oddsLabel, { color: C.kalshi }]}>Kalshi</Text>
          <Text style={[st.oddsVal, { color: C.kalshi }]}>
            {kp !== null ? pctText(kp) : '—'}
            {k ? `  ${xText(kalshiMultiplier(k.yesAsk))}` : ''}
          </Text>
        </View>
        <View style={st.oddsLine}>
          <Text style={st.oddsLabel}>{book}</Text>
          <Text style={st.oddsVal}>{xText(americanToMultiplier(ml))}</Text>
        </View>
      </View>
    );
  };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.card, fav && st.fav, pressed && { opacity: 0.85 }]}>
      <View style={st.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {game.state === 'in' && <View style={st.liveDot} />}
          <Text style={[st.status, game.state === 'in' && { color: C.red }]}>
            {game.state === 'pre' ? new Date(game.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : game.detail}
          </Text>
        </View>
        <Text style={st.colHead}>VELARYN WIN %</Text>
      </View>

      {teamRow(game.away, 1 - pred.homeWinProb)}
      {teamRow(game.home, pred.homeWinProb)}

      <View style={{ marginTop: 12 }}>
        <ProbBar home={pred.homeWinProb} />
      </View>

      {game.state !== 'post' && (
        <>
          <View style={st.oddsRow}>
            {oddsBox(game.away, odds?.awayML ?? null)}
            {oddsBox(game.home, odds?.homeML ?? null)}
          </View>
          <View style={st.foot}>
            <Text style={st.pick}>
              {pred.live ? 'Live pick  ' : 'Velaryn pick  '}
              <Text style={{ color: C.text, fontWeight: '800' }}>
                {pickTeam.abbr} {pctText(pickProb)}
              </Text>
            </Text>
            <Pill
              text={`${pred.confidence.toUpperCase()} ${'●'.repeat(TIERS.indexOf(pred.confidence) + 1)}`}
              color={pred.confidence === 'Lean' ? C.dim : pred.confidence === 'Solid' ? C.blue : C.green}
            />
          </View>
        </>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: C.line },
  fav: { borderColor: C.amber },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  status: { color: C.dim, fontSize: 13, fontWeight: '700' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  colHead: { color: C.faint, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  team: { color: C.text, fontSize: 17, fontWeight: '700' },
  record: { color: C.faint, fontSize: 12, marginTop: 2 },
  prob: { width: 64, textAlign: 'right', color: C.dim, fontSize: 20, fontWeight: '900' },
  score: { width: 48, textAlign: 'right', color: C.dim, fontSize: 22, fontWeight: '800', marginRight: 8 },
  oddsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  oddsBox: { flex: 1, backgroundColor: C.cardHi, borderRadius: 12, padding: 10, gap: 4 },
  oddsTeam: { color: C.text, fontSize: 12, fontWeight: '800', marginBottom: 2 },
  oddsLine: { flexDirection: 'row', justifyContent: 'space-between' },
  oddsLabel: { color: C.dim, fontSize: 12 },
  oddsVal: { color: C.text, fontSize: 12, fontWeight: '700' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: C.line },
  pick: { color: C.dim, fontSize: 14 },
});
