// Kalshi public market data (no login needed for prices).
// Event tickers look like KXNBAGAME-26NOV27MIANYK  ->  series-YYMONDD + AWAY + HOME.

import type { Game } from './api';

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';

// ESPN abbreviations that differ from Kalshi's
const TO_KALSHI: Record<string, string> = { NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };
export const kAbbr = (espn: string) => TO_KALSHI[espn] ?? espn;

export type PropStat = 'PTS' | 'REB' | 'AST' | '3PT';
export const PROP_SERIES: Record<PropStat, string> = { PTS: 'KXNBAPTS', REB: 'KXNBAREB', AST: 'KXNBAAST', '3PT': 'KXNBA3PT' };

export interface KalshiMarket {
  ticker: string;
  eventTicker: string;
  series: string;
  title: string; // "Boston wins", "Over 224.5 points", "Malik Monk: 20+"
  yesAsk: number | null; // dollars, 0-1
  yesBid: number | null;
  noAsk: number | null;
  noBid: number | null;
  strike: number | null;
  volume: number;
  status: string;
  result: '' | 'yes' | 'no'; // set once the market settles
}

export interface KalshiGame {
  winner: Record<string, KalshiMarket>; // espn teamId -> "Team wins" market
  totals: KalshiMarket[];
  spreads: KalshiMarket[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function parseMarket(m: any): KalshiMarket {
  const cents = (d: unknown, c: unknown) => num(d) ?? (num(c) !== null ? (num(c) as number) / 100 : null);
  return {
    ticker: m.ticker,
    eventTicker: m.event_ticker,
    series: String(m.event_ticker).split('-')[0],
    title: m.yes_sub_title || m.title,
    yesAsk: cents(m.yes_ask_dollars, m.yes_ask),
    yesBid: cents(m.yes_bid_dollars, m.yes_bid),
    noAsk: cents(m.no_ask_dollars, m.no_ask),
    noBid: cents(m.no_bid_dollars, m.no_bid),
    strike: num(m.floor_strike),
    volume: num(m.volume) ?? 0,
    status: m.status,
    result: m.result === 'yes' || m.result === 'no' ? m.result : '',
  };
}

// Kalshi crowd probability for YES: mid of bid/ask, else last available side
export const kalshiYesProb = (m: KalshiMarket) =>
  m.yesBid !== null && m.yesAsk !== null && m.yesBid > 0 ? (m.yesBid + m.yesAsk) / 2 : m.yesAsk ?? m.yesBid;

export async function fetchMarkets(tickers: string[]): Promise<Record<string, KalshiMarket>> {
  const unique = [...new Set(tickers)];
  const pairs = await Promise.all(
    unique.map(async (t) => {
      const res = await fetch(`${KALSHI}/markets/${t}`);
      if (!res.ok) return null;
      const data = await res.json();
      return [t, parseMarket(data.market)] as const;
    }),
  );
  return Object.fromEntries(pairs.filter((p): p is readonly [string, KalshiMarket] => p !== null));
}

async function getAll(query: string): Promise<KalshiMarket[]> {
  const out: KalshiMarket[] = [];
  let cursor = '';
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${KALSHI}/markets?${query}&limit=1000${cursor ? `&cursor=${cursor}` : ''}`);
    if (!res.ok) throw new Error(`Kalshi HTTP ${res.status}`);
    const data = await res.json();
    out.push(...(data.markets ?? []).map(parseMarket));
    cursor = data.cursor;
    if (!cursor) break;
  }
  return out;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Kalshi dates games on US Eastern time
function easternDateCode(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: '2-digit', month: 'numeric', day: '2-digit' })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}${MONTHS[parseInt(parts.month, 10) - 1]}${parts.day}`;
}

export const eventSuffix = (g: Game) => `${easternDateCode(g.date)}${kAbbr(g.away.team.abbr)}${kAbbr(g.home.team.abbr)}`;

export async function fetchKalshiGames(games: Game[]): Promise<Record<string, KalshiGame>> {
  const [winners, totals, spreads] = await Promise.all([
    getAll('series_ticker=KXNBAGAME&status=open'),
    getAll('series_ticker=KXNBATOTAL&status=open'),
    getAll('series_ticker=KXNBASPREAD&status=open'),
  ]);
  const out: Record<string, KalshiGame> = {};
  for (const g of games) {
    const sfx = eventSuffix(g);
    const kg: KalshiGame = { winner: {}, totals: [], spreads: [] };
    for (const m of winners) {
      if (m.eventTicker !== `KXNBAGAME-${sfx}`) continue;
      const side = m.ticker.split('-').pop();
      if (side === kAbbr(g.home.team.abbr)) kg.winner[g.home.team.id] = m;
      if (side === kAbbr(g.away.team.abbr)) kg.winner[g.away.team.id] = m;
    }
    kg.totals = totals.filter((m) => m.eventTicker === `KXNBATOTAL-${sfx}`).sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
    kg.spreads = spreads.filter((m) => m.eventTicker === `KXNBASPREAD-${sfx}`).sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
    out[g.id] = kg;
  }
  return out;
}

export interface KalshiProp extends KalshiMarket {
  stat: PropStat;
  player: string; // "Malik Monk"
  threshold: number; // 20 means "20+"
}

export async function fetchKalshiProps(game: Game): Promise<KalshiProp[]> {
  const sfx = eventSuffix(game);
  const lists = await Promise.all(
    (Object.keys(PROP_SERIES) as PropStat[]).map(async (stat) => {
      const ms = await getAll(`event_ticker=${PROP_SERIES[stat]}-${sfx}`).catch(() => []);
      return ms.map((m): KalshiProp | null => {
        const mm = /^(.*?):\s*(\d+)\+/.exec(m.title);
        if (!mm) return null;
        return { ...m, stat, player: mm[1].trim(), threshold: parseInt(mm[2], 10) };
      });
    }),
  );
  return lists.flat().filter((x): x is KalshiProp => x !== null && x.status !== 'settled');
}

// Kalshi taker fee is about 7% * P * (1 - P) per $1 contract (Kalshi rounds up to the cent per order).
export const kalshiFee = (price: number) => 0.07 * price * (1 - price);

// Total-return multiplier for a $1 stake buying at `price` (includes the fee).
export const kalshiMultiplier = (price: number | null) =>
  price && price > 0 && price < 1 ? 1 / (price + kalshiFee(price)) : null;

export const kalshiUrl = (eventTicker: string) => {
  const series = eventTicker.split('-')[0].toLowerCase();
  return `https://kalshi.com/markets/${series}/nba/${eventTicker.toLowerCase()}`;
};
