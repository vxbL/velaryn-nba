import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Game, GameSide, GameSummary, PlayerStats } from '../api';
import { americanToMultiplier, gameLegs, propLegs, type Leg } from '../edges';
import { fetchKalshiProps, kalshiMultiplier, kalshiUrl, type KalshiGame, type KalshiProp } from '../kalshi';
import { fmt, type Prediction } from '../model';
import { C, pctText, xText } from '../theme';
import { Logo, OpenButton, Pill, ProbBar, Section, s } from './common';

interface Props {
  game: Game;
  pred: Prediction;
  summary?: GameSummary;
  kalshi?: KalshiGame;
  players: Record<string, PlayerStats>;
  onClose: () => void;
}

export function GameDetail({ game, pred, summary, kalshi, players, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [props, setProps] = useState<KalshiProp[] | null>(null);
  const [legFilter, setLegFilter] = useState<Leg['kind'] | 'All'>('All');
  const [statView, setStatView] = useState<'box' | 'season'>(game.state === 'pre' ? 'season' : 'box');

  useEffect(() => {
    if (game.state === 'post') return setProps([]);
    fetchKalshiProps(game).then(setProps).catch(() => setProps([]));
  }, [game.id]);

  const legs = useMemo(() => {
    const injuries = [...(summary?.injuries[game.home.team.id] ?? []), ...(summary?.injuries[game.away.team.id] ?? [])];
    const all = [...gameLegs(game, pred, kalshi), ...(props && game.state === 'pre' ? propLegs(game, props, players, injuries) : [])];
    return all.filter((l) => l.kind !== 'Winner').sort((a, b) => b.ev - a.ev);
  }, [game, pred, kalshi, props, players, summary]);

  const odds = summary?.odds ?? game.odds;
  const shownLegs = legs.filter((l) => legFilter === 'All' || l.kind === legFilter);

  const betRow = (side: GameSide, prob: number, ml: number | null) => {
    const k = kalshi?.winner[side.team.id];
    const km = k ? kalshiMultiplier(k.yesAsk) : null;
    const bm = americanToMultiplier(ml);
    const ev = km && game.state === 'pre' ? prob * km - 1 : null;
    return (
      <View style={st.betRow}>
        <View style={[s.row, { marginBottom: 8 }]}>
          <Logo uri={side.team.logo} size={26} />
          <Text style={[s.bold, { flex: 1, marginLeft: 8, fontSize: 16 }]}>{side.team.short} to win</Text>
          <Text style={[s.bold, { fontSize: 18 }]}>{pctText(prob)}</Text>
        </View>
        <View style={st.venue}>
          <View style={{ flex: 1 }}>
            <Text style={[s.dim, { color: C.kalshi, fontWeight: '800' }]}>KALSHI</Text>
            {k && km ? (
              <Text style={s.text}>
                {Math.round((k.yesAsk ?? 0) * 100)}¢ · <Text style={s.bold}>{xText(km)}</Text> · $10 → ${(10 * km).toFixed(2)}
              </Text>
            ) : (
              <Text style={s.dim}>No open market yet</Text>
            )}
            {ev !== null && <Text style={[s.dim, { color: ev > 0 ? C.green : C.faint }]}>{ev > 0 ? `Value: +${(ev * 100).toFixed(1)}% expected` : 'No value at this price'}</Text>}
          </View>
          {k && <OpenButton small label="Open Kalshi" url={kalshiUrl(k.eventTicker)} />}
        </View>
        <View style={[st.venue, { marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.dim, { fontWeight: '800' }]}>{(odds?.provider ?? 'SPORTSBOOK').toUpperCase()}</Text>
            {bm ? (
              <Text style={s.text}>
                {ml! > 0 ? `+${ml}` : ml} · <Text style={s.bold}>{xText(bm)}</Text> · $10 → ${(10 * bm).toFixed(2)}
              </Text>
            ) : (
              <Text style={s.dim}>Line not posted yet</Text>
            )}
          </View>
          {bm && <OpenButton small label={`Open ${odds?.provider ?? 'book'}`} url={odds?.link ?? null} color="#61B510" />}
        </View>
      </View>
    );
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={st.top}>
          <Text style={s.dim}>{game.state === 'pre' ? new Date(game.date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : game.detail}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: C.blue, fontSize: 16, fontWeight: '700' }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {/* Scoreboard */}
          <View style={st.hero}>
            <HeroTeam side={game.away} prob={1 - pred.homeWinProb} showScore={game.state !== 'pre'} />
            <View style={{ alignItems: 'center' }}>
              <Text style={s.dim}>{pred.live ? 'LIVE WIN %' : game.state === 'post' ? 'FINAL' : 'WIN %'}</Text>
              {pred.projectedHome !== null && game.state === 'pre' && (
                <Text style={[s.dim, { marginTop: 6 }]}>
                  Proj {Math.round(pred.projectedAway!)}-{Math.round(pred.projectedHome)}
                </Text>
              )}
            </View>
            <HeroTeam side={game.home} prob={pred.homeWinProb} showScore={game.state !== 'pre'} />
          </View>
          <ProbBar home={pred.homeWinProb} />
          <View style={[s.row, { justifyContent: 'space-between', marginTop: 8, marginBottom: 16 }]}>
            <Text style={s.dim}>Velaryn model {pctText(1 - pred.modelHomeWinProb)}–{pctText(pred.modelHomeWinProb)}</Text>
            {pred.marketHomeWinProb !== null && <Text style={s.dim}>Market {pctText(1 - pred.marketHomeWinProb)}–{pctText(pred.marketHomeWinProb)}</Text>}
            {pred.bpiHomeWinProb !== null && <Text style={s.dim}>BPI {pctText(1 - pred.bpiHomeWinProb)}–{pctText(pred.bpiHomeWinProb)}</Text>}
          </View>

          {game.state !== 'post' && (
            <Section title="Bet the winner">
              {betRow(game.away, 1 - pred.homeWinProb, odds?.awayML ?? null)}
              {betRow(game.home, pred.homeWinProb, odds?.homeML ?? null)}
              <Text style={[s.dim, { marginTop: 6 }]}>Multiplier = total payout per $1 staked (stake included, Kalshi fee included).</Text>
            </Section>
          )}

          {game.state !== 'post' && (
            <Section title="Kalshi: totals, spreads & player props" right={props === null ? <ActivityIndicator color={C.kalshi} /> : undefined}>
              <View style={[s.row, { gap: 6, marginBottom: 10, flexWrap: 'wrap' }]}>
                {(['All', 'Total', 'Spread', 'Prop'] as const).map((f) => (
                  <Pressable key={f} onPress={() => setLegFilter(f)}>
                    <Pill text={f === 'All' ? 'ALL' : f.toUpperCase() + 'S'} color={legFilter === f ? C.kalshi : C.faint} />
                  </Pressable>
                ))}
              </View>
              {shownLegs.length === 0 && (
                <Text style={s.dim}>
                  {game.state === 'in'
                    ? 'Velaryn only rates bets before tip-off. Live prices move every possession.'
                    : props === null
                      ? 'Loading Kalshi markets…'
                      : 'Kalshi has not opened these markets for this game yet (they usually appear on game day).'}
                </Text>
              )}
              {shownLegs.slice(0, 40).map((l) => (
                <LegRow key={l.id} leg={l} />
              ))}
            </Section>
          )}

          <Section title="Why Velaryn likes this">
            {pred.factors.map((f) => (
              <View key={f.label} style={st.factor}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>{f.label}</Text>
                  <Text style={s.dim}>{f.detail}</Text>
                </View>
                <Text style={[s.bold, { color: Math.abs(f.points) < 0.05 ? C.dim : f.points > 0 ? C.red : C.blue }]}>
                  {Math.abs(f.points) < 0.05 ? '—' : `${f.points > 0 ? game.home.team.abbr : game.away.team.abbr} ${fmt(Math.abs(f.points))}`}
                </Text>
              </View>
            ))}
            <Text style={[s.dim, { marginTop: 8 }]}>
              Projected margin: {pred.projectedMargin >= 0 ? game.home.team.abbr : game.away.team.abbr} by {Math.abs(pred.projectedMargin).toFixed(1)}
              {pred.edge !== null ? ` · Model vs market: ${fmt(pred.edge)} pts on ${game.home.team.abbr}` : ''}
            </Text>
          </Section>

          <Section title="Injury report">
            {[game.away, game.home].map((side) => {
              const list = side === game.home ? pred.injuries.home : pred.injuries.away;
              return (
                <View key={side.team.id} style={{ marginBottom: 10 }}>
                  <Text style={[s.bold, { marginBottom: 4 }]}>{side.team.short}</Text>
                  {list.length === 0 && <Text style={s.dim}>No injuries reported</Text>}
                  {list.map((i) => (
                    <View key={i.athleteId + i.name} style={st.injury}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.text}>
                          {i.name} <Text style={s.dim}>{i.position} · {i.type}</Text>
                        </Text>
                        <Text style={s.dim}>{i.line}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.bold, { color: /out/i.test(i.status) ? C.red : C.amber, fontSize: 12 }]}>{i.status}</Text>
                        <Text style={s.dim}>{i.points > 0.05 ? `-${i.points.toFixed(1)} pts` : 'minor'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </Section>

          {summary && (
            <Section title="Recent form">
              {[game.away, game.home].map((side) => (
                <View key={side.team.id} style={[s.row, { marginBottom: 8 }]}>
                  <Text style={[s.bold, { width: 60 }]}>{side.team.abbr}</Text>
                  {(summary.lastFive[side.team.id] ?? []).map((r, i) => (
                    <View key={i} style={[st.form, { backgroundColor: r.result === 'W' ? '#123d24' : '#3d1219' }]}>
                      <Text style={{ color: r.result === 'W' ? C.green : C.red, fontWeight: '800', fontSize: 11 }}>{r.result}</Text>
                      <Text style={{ color: C.dim, fontSize: 9 }}>
                        {r.atVs} {r.opponent}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
              {!!summary.series && <Text style={s.dim}>Season series: {summary.series}</Text>}
            </Section>
          )}

          <Section
            title="Player stats"
            right={
              <View style={[s.row, { gap: 6 }]}>
                {game.state !== 'pre' && (
                  <Pressable onPress={() => setStatView('box')}>
                    <Pill text="THIS GAME" color={statView === 'box' ? C.blue : C.faint} />
                  </Pressable>
                )}
                <Pressable onPress={() => setStatView('season')}>
                  <Pill text="PER GAME AVG" color={statView === 'season' ? C.blue : C.faint} />
                </Pressable>
              </View>
            }
          >
            {[game.away, game.home].map((side) =>
              statView === 'box' ? (
                <BoxTable key={side.team.id} side={side} summary={summary} />
              ) : (
                <SeasonTable key={side.team.id} side={side} players={players} />
              ),
            )}
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

function HeroTeam({ side, prob, showScore }: { side: GameSide; prob: number; showScore: boolean }) {
  return (
    <View style={{ alignItems: 'center', width: 110 }}>
      <Logo uri={side.team.logo} size={56} />
      <Text style={[s.bold, { marginTop: 6 }]}>{side.team.short}</Text>
      <Text style={s.dim}>{side.record}</Text>
      <Text style={{ color: C.text, fontSize: showScore ? 32 : 26, fontWeight: '900', marginTop: 4 }}>{showScore ? side.score : pctText(prob)}</Text>
      {showScore && <Text style={s.dim}>{pctText(prob)} to win</Text>}
    </View>
  );
}

function LegRow({ leg }: { leg: Leg }) {
  const good = leg.ev > 0.02;
  return (
    <View style={st.leg}>
      <View style={{ flex: 1 }}>
        <Text style={s.bold}>{leg.label}</Text>
        <Text style={s.dim}>
          Velaryn {pctText(leg.prob)} · {leg.side} {Math.round(leg.price * 100)}¢ · {xText(leg.multiplier)}
          {leg.note ? ` · ${leg.note}` : ''}
        </Text>
        <Text style={[s.dim, { color: good ? C.green : C.faint }]}>{good ? `+${(leg.ev * 100).toFixed(1)}% expected value` : `${(leg.ev * 100).toFixed(1)}% expected value`}</Text>
      </View>
      <OpenButton small label="Kalshi" url={leg.url} />
    </View>
  );
}

function BoxTable({ side, summary }: { side: GameSide; summary?: GameSummary }) {
  const box = summary?.box[side.team.id];
  if (!box || box.players.length === 0) return <Text style={[s.dim, { marginBottom: 10 }]}>{side.team.short}: box score not available yet</Text>;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.bold, { marginBottom: 6 }]}>{side.team.short}</Text>
      <View style={{ flexDirection: 'row' }}>
        <View>
          <Text style={[st.cell, st.nameCell, st.headCell]}>PLAYER</Text>
          {box.players.map((p) => (
            <Text key={p.id} numberOfLines={1} style={[st.cell, st.nameCell, p.starter && { fontWeight: '800' }]}>
              {p.name}
            </Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: 'row' }}>
              {box.labels.map((l) => (
                <Text key={l} style={[st.cell, st.headCell]}>
                  {l}
                </Text>
              ))}
            </View>
            {box.players.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row' }}>
                {p.dnp ? (
                  <Text style={[st.cell, { width: 200, textAlign: 'left', color: C.faint }]}>{p.dnp}</Text>
                ) : (
                  p.stats.map((v, i) => (
                    <Text key={i} style={[st.cell, box.labels[i] === 'PTS' && { color: C.text, fontWeight: '800' }]}>
                      {v}
                    </Text>
                  ))
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const SEASON_COLS: [string, (p: PlayerStats) => string][] = [
  ['GP', (p) => String(p.gp)],
  ['MIN', (p) => p.min.toFixed(1)],
  ['PTS', (p) => p.pts.toFixed(1)],
  ['REB', (p) => p.reb.toFixed(1)],
  ['AST', (p) => p.ast.toFixed(1)],
  ['STL', (p) => p.stl.toFixed(1)],
  ['BLK', (p) => p.blk.toFixed(1)],
  ['TO', (p) => p.tov.toFixed(1)],
  ['FGM-A', (p) => `${p.fgm.toFixed(1)}-${p.fga.toFixed(1)}`],
  ['FG%', (p) => p.fgPct.toFixed(1)],
  ['3PM-A', (p) => `${p.tpm.toFixed(1)}-${p.tpa.toFixed(1)}`],
  ['3P%', (p) => p.tpPct.toFixed(1)],
  ['FTM-A', (p) => `${p.ftm.toFixed(1)}-${p.fta.toFixed(1)}`],
  ['FT%', (p) => p.ftPct.toFixed(1)],
  ['PF', (p) => p.fouls.toFixed(1)],
];

function SeasonTable({ side, players }: { side: GameSide; players: Record<string, PlayerStats> }) {
  const roster = Object.values(players)
    .filter((p) => p.teamId === side.team.id)
    .sort((a, b) => b.min - a.min);
  if (roster.length === 0) return <Text style={[s.dim, { marginBottom: 10 }]}>{side.team.short}: no season stats</Text>;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.bold, { marginBottom: 6 }]}>{side.team.short} · season per-game averages</Text>
      <View style={{ flexDirection: 'row' }}>
        <View>
          <Text style={[st.cell, st.nameCell, st.headCell]}>PLAYER</Text>
          {roster.map((p) => (
            <Text key={p.id} numberOfLines={1} style={[st.cell, st.nameCell]}>
              {p.name}
            </Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: 'row' }}>
              {SEASON_COLS.map(([h]) => (
                <Text key={h} style={[st.cell, st.headCell, h.includes('-') && st.wide]}>
                  {h}
                </Text>
              ))}
            </View>
            {roster.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row' }}>
                {SEASON_COLS.map(([h, f]) => (
                  <Text key={h} style={[st.cell, h.includes('-') && st.wide, h === 'PTS' && { color: C.text, fontWeight: '800' }]}>
                    {f(p)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: C.line },
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  betRow: { paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  venue: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardHi, borderRadius: 10, padding: 10, gap: 10 },
  factor: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderColor: C.line, gap: 10 },
  injury: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line, gap: 8 },
  form: { width: 44, alignItems: 'center', borderRadius: 6, paddingVertical: 3, marginRight: 4 },
  leg: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line, gap: 10 },
  cell: { width: 44, height: 24, lineHeight: 24, textAlign: 'right', color: C.dim, fontSize: 12 },
  wide: { width: 70 },
  nameCell: { width: 110, textAlign: 'left', color: C.text },
  headCell: { color: C.faint, fontWeight: '800', fontSize: 10 },
});
