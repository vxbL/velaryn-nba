// Velaryn prediction engine.
//
// 1. Build a projected home-court point margin from: season net rating (shrunk toward
//    league average early in the season), home court, home/road splits, recent form,
//    rest (back-to-backs), and player-level injury impact.
// 2. Convert margin -> win probability with a normal CDF (NBA game margins have a
//    standard deviation of roughly 12 points around the expectation).
// 3. Blend with the betting market (de-vigged moneyline) and ESPN BPI in log-odds space.
//    The market is the hardest benchmark to beat, so it gets real weight; the "edge"
//    shown in the app is where Velaryn's own model disagrees with it.
// 4. During a live game, condition on the current score and time remaining.

import type { Game, GameSummary, Injury, Odds, PlayerStats, TeamStanding } from './api';

export const MARGIN_SD = 12;
const HOME_COURT = 2.2;
const B2B_PENALTY = 1.8;
const SHRINK_GAMES = 8;
const INJURY_FACTOR = 0.3;
const WEIGHTS = { model: 0.45, market: 0.4, bpi: 0.15 };

const STATUS_WEIGHT: Record<string, number> = {
  out: 1,
  suspension: 1,
  doubtful: 0.8,
  questionable: 0.45,
  'day-to-day': 0.35,
  probable: 0.1,
};

export interface Factor {
  label: string;
  points: number; // + favors home, - favors away
  detail: string;
}

export interface InjuryImpact extends Injury {
  points: number; // margin points this team loses
  line: string; // "24.1 pts / 7.2 reb / 5.0 ast"
}

export interface Prediction {
  homeWinProb: number; // final blended probability, 0-1
  modelHomeWinProb: number; // Velaryn's pure model
  marketHomeWinProb: number | null;
  bpiHomeWinProb: number | null;
  projectedMargin: number; // home minus away, points
  projectedTotal: number | null;
  projectedHome: number | null;
  projectedAway: number | null;
  factors: Factor[];
  injuries: { home: InjuryImpact[]; away: InjuryImpact[] };
  pickTeamId: string;
  confidence: 'Lean' | 'Solid' | 'Strong' | 'Lock';
  edge: number | null; // model - market, home perspective, percentage points
  live: boolean;
}

export interface ModelContext {
  standings: Record<string, TeamStanding>;
  players: Record<string, PlayerStats>;
  playedYesterday: Set<string>;
  summary?: GameSummary;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// Abramowitz & Stegun 7.1.26
function erf(x: number) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0.5);

function impliedFromMoneyline(ml: number) {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

export function marketHomeProb(odds: Odds | null): number | null {
  if (!odds) return null;
  if (odds.homeML !== null && odds.awayML !== null) {
    const h = impliedFromMoneyline(odds.homeML);
    const a = impliedFromMoneyline(odds.awayML);
    return h / (h + a); // remove the vig
  }
  if (odds.homeSpread !== null) return normCdf(-odds.homeSpread / MARGIN_SD);
  return null;
}

// John Hollinger's Game Score per game, minus a replacement-level baseline per minute,
// converted into the margin a team loses without that player.
export function playerImpact(p: PlayerStats): number {
  const gameScore =
    p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.5 * p.reb + 0.7 * p.ast + p.stl + 0.7 * p.blk - 0.4 * p.fouls - p.tov;
  return Math.max(0, gameScore - 0.2 * p.min) * INJURY_FACTOR;
}

function injuryImpacts(list: Injury[] | undefined, ctx: ModelContext, teamGp: number): InjuryImpact[] {
  return (list ?? [])
    .map((inj) => {
      const p = ctx.players[inj.athleteId];
      const w = STATUS_WEIGHT[inj.status.toLowerCase()] ?? 0.5;
      if (!p || p.gp === 0) return { ...inj, points: 0, line: 'No stats this season' };
      // If he has already missed a lot of games, the team's season numbers already reflect it.
      const presence = teamGp ? clamp(p.gp / teamGp, 0, 1) : 1;
      return {
        ...inj,
        points: playerImpact(p) * w * presence,
        line: `${p.pts.toFixed(1)} pts / ${p.reb.toFixed(1)} reb / ${p.ast.toFixed(1)} ast · ${p.min.toFixed(0)} min`,
      };
    })
    .sort((a, b) => b.points - a.points);
}

export function predict(game: Game, ctx: ModelContext): Prediction {
  const h = ctx.standings[game.home.team.id];
  const a = ctx.standings[game.away.team.id];
  const sum = ctx.summary;
  const factors: Factor[] = [];

  const hGp = h ? h.wins + h.losses : 0;
  const aGp = a ? a.wins + a.losses : 0;

  // Season strength
  const hNet = h ? (h.net * hGp) / (hGp + SHRINK_GAMES) : 0;
  const aNet = a ? (a.net * aGp) / (aGp + SHRINK_GAMES) : 0;
  factors.push({
    label: 'Season net rating',
    points: hNet - aNet,
    detail: `${game.home.team.abbr} ${fmt(h?.net ?? 0)} vs ${game.away.team.abbr} ${fmt(a?.net ?? 0)} pts/game`,
  });

  factors.push({ label: 'Home court', points: HOME_COURT, detail: `${game.home.team.abbr} at home` });

  // Venue splits: how much better is the home team at home / the away team on the road
  if (h && a) {
    const hSplit = pct(...h.home) - h.winPct;
    const aSplit = a.winPct - pct(...a.road);
    const n = Math.min(h.home[0] + h.home[1], a.road[0] + a.road[1]);
    const pts = clamp((hSplit + aSplit) * 6 * (n / (n + 10)), -1.5, 1.5);
    factors.push({
      label: 'Home/road splits',
      points: pts,
      detail: `${game.home.team.abbr} ${h.home.join('-')} home · ${game.away.team.abbr} ${a.road.join('-')} road`,
    });
  }

  // Recent form: last-five scoring margin vs season, falling back to last-ten record
  const l5h = sum?.lastFive[game.home.team.id];
  const l5a = sum?.lastFive[game.away.team.id];
  if (l5h?.length && l5a?.length && h && a) {
    const avg = (g: { margin: number }[]) => g.reduce((s, x) => s + x.margin, 0) / g.length;
    const pts = clamp(0.25 * (avg(l5h) - h.net - (avg(l5a) - a.net)), -3, 3);
    factors.push({
      label: 'Recent form (last 5)',
      points: pts,
      detail: `${game.home.team.abbr} ${fmt(avg(l5h))} · ${game.away.team.abbr} ${fmt(avg(l5a))} avg margin`,
    });
  } else if (h && a) {
    const pts = clamp(((pct(...h.last10) - h.winPct) - (pct(...a.last10) - a.winPct)) * 5, -2.5, 2.5);
    factors.push({
      label: 'Recent form (last 10)',
      points: pts,
      detail: `${game.home.team.abbr} ${h.last10.join('-')} · ${game.away.team.abbr} ${a.last10.join('-')}`,
    });
  }

  // Rest
  const hB2B = ctx.playedYesterday.has(game.home.team.id);
  const aB2B = ctx.playedYesterday.has(game.away.team.id);
  if (hB2B || aB2B) {
    factors.push({
      label: 'Rest / back-to-back',
      points: (aB2B ? B2B_PENALTY : 0) - (hB2B ? B2B_PENALTY : 0),
      detail: [hB2B && `${game.home.team.abbr} on a B2B`, aB2B && `${game.away.team.abbr} on a B2B`].filter(Boolean).join(' · '),
    });
  }

  // Injuries
  const hInj = injuryImpacts(sum?.injuries[game.home.team.id], ctx, hGp);
  const aInj = injuryImpacts(sum?.injuries[game.away.team.id], ctx, aGp);
  const hLoss = Math.min(12, hInj.reduce((s, x) => s + x.points, 0));
  const aLoss = Math.min(12, aInj.reduce((s, x) => s + x.points, 0));
  if (sum) {
    factors.push({
      label: 'Injuries',
      points: aLoss - hLoss,
      detail: `${game.home.team.abbr} -${hLoss.toFixed(1)} · ${game.away.team.abbr} -${aLoss.toFixed(1)} pts of talent out`,
    });
  }

  const margin = factors.reduce((s, f) => s + f.points, 0);
  const modelP = normCdf(margin / MARGIN_SD);
  const marketP = marketHomeProb(sum?.odds ?? game.odds);
  const bpiP = sum?.bpiHome ?? null;

  // Blend in log-odds space over whichever signals exist
  const parts: [number, number][] = [[modelP, WEIGHTS.model]];
  if (marketP !== null) parts.push([marketP, WEIGHTS.market]);
  if (bpiP !== null && bpiP > 0 && bpiP < 1) parts.push([bpiP, WEIGHTS.bpi]);
  const wSum = parts.reduce((s, [, w]) => s + w, 0);
  let p = sigmoid(parts.reduce((s, [q, w]) => s + logit(clamp(q, 0.01, 0.99)) * w, 0) / wSum);
  const blendedMargin = MARGIN_SD * inverseNormApprox(p);

  // Live: condition on score and time remaining
  let live = false;
  if (game.state === 'in') {
    live = true;
    const remainingMin =
      game.period <= 4 ? (4 - game.period) * 12 + game.clock / 60 : game.clock / 60;
    const frac = clamp(remainingMin / 48, 0, 1);
    const lead = game.home.score - game.away.score;
    const sd = Math.max(0.5, MARGIN_SD * Math.sqrt(frac));
    const ourLive = normCdf((lead + blendedMargin * frac) / sd);
    p = sum?.liveHomeWP != null ? 0.5 * ourLive + 0.5 * sum.liveHomeWP : ourLive;
  } else if (game.state === 'post') {
    p = game.home.score > game.away.score ? 1 : 0;
  }

  // Projected total: each offense vs the other defense, blended with the market line when there is one
  const ownTotal = h && a ? (h.ppg + a.oppPpg + a.ppg + h.oppPpg) / 2 - (hLoss + aLoss) / 2 : null;
  const lineTotal = sum?.odds?.overUnder ?? game.odds?.overUnder ?? null;
  const total = ownTotal !== null && lineTotal !== null ? (ownTotal + lineTotal) / 2 : ownTotal ?? lineTotal;
  const pick = p >= 0.5 ? game.home.team.id : game.away.team.id;
  const sure = Math.max(p, 1 - p);

  return {
    homeWinProb: p,
    modelHomeWinProb: modelP,
    marketHomeWinProb: marketP,
    bpiHomeWinProb: bpiP,
    projectedMargin: blendedMargin,
    projectedTotal: total,
    projectedHome: total !== null ? total / 2 + blendedMargin / 2 : null,
    projectedAway: total !== null ? total / 2 - blendedMargin / 2 : null,
    factors,
    injuries: { home: hInj, away: aInj },
    pickTeamId: pick,
    confidence: sure >= 0.85 ? 'Lock' : sure >= 0.72 ? 'Strong' : sure >= 0.6 ? 'Solid' : 'Lean',
    edge: marketP !== null ? (modelP - marketP) * 100 : null,
    live,
  };
}

// Inverse normal CDF (Acklam's rational approximation, good to ~1e-9)
function inverseNormApprox(p: number): number {
  p = clamp(p, 1e-6, 1 - 1e-6);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -inverseNormApprox(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
