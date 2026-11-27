// Turns Kalshi prices + Velaryn probabilities into bet "legs" with expected value,
// then builds multi-game combos.
//
// For totals, spreads and player props our own estimate is blended 50/50 with Kalshi's
// mid price before computing value. A raw model that disagrees wildly with a liquid market
// is usually missing information (late scratches, minutes limits), not finding free money.

import type { Game, Injury, PlayerStats } from './api';
import { kAbbr, kalshiMultiplier, kalshiUrl, type KalshiGame, type KalshiMarket, type KalshiProp, type PropStat } from './kalshi';
import { MARGIN_SD, normCdf, type Prediction } from './model';

const TOTAL_SD = 17;

export interface Leg {
  id: string;
  ticker: string; // Kalshi market ticker
  gameId: string;
  game: string; // "MIA @ NYK"
  kind: 'Winner' | 'Total' | 'Spread' | 'Prop';
  label: string; // "Knicks to win", "Over 224.5", "Brunson 25+ pts"
  side: 'YES' | 'NO';
  price: number; // dollars per $1 contract
  prob: number; // Velaryn fair probability
  multiplier: number; // total return per $1 incl. fee
  ev: number; // expected profit per $1 staked
  url: string;
  note?: string;
}

const mid = (m: KalshiMarket) =>
  m.yesBid !== null && m.yesAsk !== null ? (m.yesBid + m.yesAsk) / 2 : m.yesAsk ?? m.yesBid ?? null;

function makeLeg(base: Omit<Leg, 'multiplier' | 'ev'>): Leg | null {
  const multiplier = kalshiMultiplier(base.price);
  if (!multiplier || base.price < 0.03 || base.price > 0.97) return null;
  return { ...base, multiplier, ev: base.prob * multiplier - 1 };
}

function blendWithMarket(model: number, m: KalshiMarket, side: 'YES' | 'NO') {
  const mm = mid(m);
  if (mm === null) return model;
  return 0.5 * model + 0.5 * (side === 'YES' ? mm : 1 - mm);
}

export function gameLegs(game: Game, pred: Prediction, kg: KalshiGame | undefined): Leg[] {
  // Pregame only: live Kalshi prices move with every possession and our pregame inputs go stale
  if (!kg || game.state !== 'pre') return [];
  const name = `${game.away.team.abbr} @ ${game.home.team.abbr}`;
  const legs: (Leg | null)[] = [];

  for (const side of [game.home, game.away]) {
    const m = kg.winner[side.team.id];
    if (!m || m.yesAsk === null) continue;
    const prob = side === game.home ? pred.homeWinProb : 1 - pred.homeWinProb;
    legs.push(
      makeLeg({ id: m.ticker, ticker: m.ticker, gameId: game.id, game: name, kind: 'Winner', label: `${side.team.short} to win`, side: 'YES', price: m.yesAsk, prob, url: kalshiUrl(m.eventTicker) }),
    );
  }

  if (pred.projectedTotal !== null && game.state === 'pre') {
    for (const m of kg.totals) {
      if (m.strike === null) continue;
      const over = 1 - normCdf((m.strike - pred.projectedTotal) / TOTAL_SD);
      if (m.yesAsk !== null)
        legs.push(makeLeg({ id: `${m.ticker}-Y`, ticker: m.ticker, gameId: game.id, game: name, kind: 'Total', label: `Over ${m.strike} pts`, side: 'YES', price: m.yesAsk, prob: blendWithMarket(over, m, 'YES'), url: kalshiUrl(m.eventTicker) }));
      if (m.noAsk !== null)
        legs.push(makeLeg({ id: `${m.ticker}-N`, ticker: m.ticker, gameId: game.id, game: name, kind: 'Total', label: `Under ${m.strike} pts`, side: 'NO', price: m.noAsk, prob: blendWithMarket(1 - over, m, 'NO'), url: kalshiUrl(m.eventTicker) }));
    }
  }

  if (game.state === 'pre') {
    for (const m of kg.spreads) {
      if (m.strike === null) continue;
      // Ticker ends in e.g. "SAS9": Kalshi abbreviation + rounded strike
      const abbr = /-([A-Z]+)\d+$/.exec(m.ticker)?.[1] ?? '';
      const isHome = abbr === kAbbr(game.home.team.abbr);
      const teamMargin = isHome ? pred.projectedMargin : -pred.projectedMargin;
      const cover = 1 - normCdf((m.strike - teamMargin) / MARGIN_SD);
      if (m.yesAsk !== null)
        legs.push(makeLeg({ id: `${m.ticker}-Y`, ticker: m.ticker, gameId: game.id, game: name, kind: 'Spread', label: m.title, side: 'YES', price: m.yesAsk, prob: blendWithMarket(cover, m, 'YES'), url: kalshiUrl(m.eventTicker) }));
    }
  }
  return legs.filter((l): l is Leg => l !== null);
}

const PROP_SD: Record<PropStat, (mu: number) => number> = {
  PTS: (mu) => 0.28 * mu + 2.5,
  REB: (mu) => 0.35 * mu + 1.2,
  AST: (mu) => 0.38 * mu + 1,
  '3PT': (mu) => 0.95 * Math.sqrt(mu) + 0.3,
};
const propMean = (p: PlayerStats, s: PropStat) => (s === 'PTS' ? p.pts : s === 'REB' ? p.reb : s === 'AST' ? p.ast : p.tpm);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function propLegs(game: Game, props: KalshiProp[], players: Record<string, PlayerStats>, injuries: Injury[]): Leg[] {
  if (game.state !== 'pre') return [];
  const byName: Record<string, PlayerStats> = {};
  for (const p of Object.values(players)) {
    if (p.teamId === game.home.team.id || p.teamId === game.away.team.id) byName[norm(p.name)] = p;
  }
  const injured: Record<string, string> = {};
  for (const i of injuries) injured[norm(i.name)] = i.status;
  const name = `${game.away.team.abbr} @ ${game.home.team.abbr}`;
  const label: Record<PropStat, string> = { PTS: 'pts', REB: 'reb', AST: 'ast', '3PT': 'threes' };

  const legs: Leg[] = [];
  for (const m of props) {
    const p = byName[norm(m.player)];
    const status = injured[norm(m.player)];
    if (!p || p.gp < 5 || m.yesAsk === null || /out|doubtful/i.test(status ?? '')) continue;
    const mu = propMean(p, m.stat);
    const model = 1 - normCdf((m.threshold - 0.5 - mu) / PROP_SD[m.stat](mu));
    const leg = makeLeg({
      id: m.ticker,
      ticker: m.ticker,
      gameId: game.id,
      game: name,
      kind: 'Prop',
      label: `${m.player} ${m.threshold}+ ${label[m.stat]}`,
      side: 'YES',
      price: m.yesAsk,
      prob: blendWithMarket(model, m, 'YES'),
      url: kalshiUrl(m.eventTicker),
      note: `Season avg ${mu.toFixed(1)}${status ? ` · ${status}` : ''}`,
    });
    if (leg) legs.push(leg);
  }
  return legs;
}

export interface Combo {
  legs: Leg[];
  prob: number; // chance every leg hits (legs are from different games, treated as independent)
  multiplier: number;
  ev: number;
  stakePct: number; // quarter-Kelly, capped, % of bankroll
}

// Value legs only: positive expected value and more likely than not to hit.
export const valueLegs = (legs: Leg[], minProb = 0.55, minEv = 0.02) =>
  legs.filter((l) => l.ev > minEv && l.prob >= minProb).sort((a, b) => b.ev - a.ev);

export function kellyPct(prob: number, multiplier: number) {
  const b = multiplier - 1;
  if (b <= 0) return 0;
  const f = (prob * multiplier - 1) / b;
  return Math.max(0, Math.min(5, f * 25)); // quarter Kelly, max 5% of bankroll
}

export type ComboMode = 'safest' | 'value' | 'payout';

// Favorites are usually priced close to fair, so 'safest' accepts any positive edge.
const MODES: Record<ComboMode, { minLegProb: number; minEv: number; maxLegs: number; minComboProb: number }> = {
  safest: { minLegProb: 0.65, minEv: 0, maxLegs: 3, minComboProb: 0.45 }, // highest chance to hit, smaller payout
  value: { minLegProb: 0.6, minEv: 0.02, maxLegs: 3, minComboProb: 0.3 }, // best payout-to-risk (expected value)
  payout: { minLegProb: 0.55, minEv: 0.02, maxLegs: 4, minComboProb: 0.15 }, // bigger multiplier, hits less often
};

export function buildCombos(legs: Leg[], mode: ComboMode = 'safest', max = 8): Combo[] {
  const cfg = MODES[mode];
  // One leg per game so legs don't depend on each other. In 'safest' mode keep the most likely
  // value leg of each game, otherwise the one with the best expected value.
  const perGame = new Map<string, Leg>();
  for (const l of valueLegs(legs, cfg.minLegProb, cfg.minEv)) {
    const cur = perGame.get(l.gameId);
    const better = mode === 'safest' ? !cur || l.prob > cur.prob : !cur || l.ev > cur.ev;
    if (better) perGame.set(l.gameId, l);
  }
  const pool = [...perGame.values()].sort((a, b) => b.prob - a.prob).slice(0, 10);
  const combos: Combo[] = [];
  const add = (ls: Leg[]) => {
    const prob = ls.reduce((s, l) => s * l.prob, 1);
    const multiplier = ls.reduce((s, l) => s * l.multiplier, 1);
    const ev = prob * multiplier - 1;
    if (ev > 0 && prob >= cfg.minComboProb) combos.push({ legs: ls, prob, multiplier, ev, stakePct: kellyPct(prob, multiplier) });
  };
  const pick = (start: number, chosen: Leg[]) => {
    if (chosen.length >= 2) add(chosen);
    if (chosen.length === cfg.maxLegs) return;
    for (let i = start; i < pool.length; i++) pick(i + 1, [...chosen, pool[i]]);
  };
  pick(0, []);
  const sorters: Record<ComboMode, (a: Combo, b: Combo) => number> = {
    safest: (a, b) => b.prob - a.prob || b.ev - a.ev,
    value: (a, b) => b.ev - a.ev,
    payout: (a, b) => b.multiplier - a.multiplier,
  };
  return combos.sort(sorters[mode]).slice(0, max);
}

export const comboStats = (legs: Leg[]) => {
  const prob = legs.reduce((s, l) => s * l.prob, 1);
  const multiplier = legs.reduce((s, l) => s * l.multiplier, 1);
  return { prob, multiplier, ev: prob * multiplier - 1 };
};

export const americanToMultiplier = (ml: number | null) => (ml === null ? null : ml > 0 ? 1 + ml / 100 : 1 + 100 / -ml);
