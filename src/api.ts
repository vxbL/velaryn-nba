// Data layer. Everything comes from ESPN's public JSON feeds (no API key needed).

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const PLAYER_STATS =
  'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';

export type GameState = 'pre' | 'in' | 'post';

export interface Team {
  id: string;
  abbr: string;
  name: string;
  short: string;
  logo: string;
  color: string;
}

export interface GameSide {
  team: Team;
  score: number;
  record: string;
  stats: Record<string, number>; // season team stats from the scoreboard (FG%, 3P%, ...)
}

export interface Odds {
  provider: string;
  details: string; // e.g. "NY -4.5"
  homeSpread: number | null; // negative = home favored
  overUnder: number | null;
  homeML: number | null;
  awayML: number | null;
  link: string | null; // sportsbook bet link (opens the app if installed)
}

export interface BoxPlayer {
  id: string;
  name: string;
  position: string;
  starter: boolean;
  dnp: string | null; // reason if the player did not play
  stats: string[];
}

export interface BoxScore {
  labels: string[]; // MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-
  players: BoxPlayer[];
}

export interface Game {
  id: string;
  date: string;
  state: GameState;
  detail: string; // "Final", "Q3 4:21", "7:30 PM EST"
  period: number;
  clock: number; // seconds left in the period
  home: GameSide;
  away: GameSide;
  odds: Odds | null;
  broadcast: string;
}

export interface Injury {
  athleteId: string;
  name: string;
  position: string;
  status: string; // Out, Doubtful, Questionable, Day-To-Day, ...
  type: string; // "Knee", "Hamstring", ...
  returnDate?: string;
}

export interface RecentGame {
  result: 'W' | 'L';
  margin: number;
  opponent: string;
  atVs: string;
}

export interface GameSummary {
  bpiHome: number | null; // ESPN Basketball Power Index home win %, 0-1
  liveHomeWP: number | null; // ESPN live win probability for home, 0-1
  odds: Odds | null;
  injuries: Record<string, Injury[]>; // teamId -> injuries
  lastFive: Record<string, RecentGame[]>; // teamId -> last five results
  series: string; // "NY leads 1-0"
  box: Record<string, BoxScore>; // teamId -> box score (live and final games)
}

export interface TeamStanding {
  team: Team;
  conference: 'East' | 'West';
  seed: number;
  wins: number;
  losses: number;
  winPct: number;
  ppg: number;
  oppPpg: number;
  net: number;
  home: [number, number];
  road: [number, number];
  last10: [number, number];
  streak: string;
}

export interface PlayerStats {
  id: string;
  name: string;
  teamId: string;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  tpm: number;
  tpa: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  position: string;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const winLoss = (s: string | undefined): [number, number] => {
  const m = /(\d+)-(\d+)/.exec(s ?? '');
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
};

export const yyyymmdd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

function parseTeam(t: any): Team {
  return {
    id: String(t.id),
    abbr: t.abbreviation,
    name: t.displayName,
    short: t.shortDisplayName ?? t.name,
    logo: t.logo ?? t.logos?.[0]?.href ?? `https://a.espncdn.com/i/teamlogos/nba/500/${String(t.abbreviation).toLowerCase()}.png`,
    color: `#${t.color ?? '1E5BFF'}`,
  };
}

function parseOdds(o: any, homeAbbr: string): Odds | null {
  if (!o) return null;
  let homeSpread = num(o.spread);
  if (homeSpread === null && typeof o.details === 'string') {
    if (/even/i.test(o.details)) homeSpread = 0;
    const m = /^(\w+)\s+([-+]?\d+(\.\d+)?)/.exec(o.details);
    if (m) homeSpread = m[1] === homeAbbr ? parseFloat(m[2]) : -parseFloat(m[2]);
  }
  return {
    provider: o.provider?.name ?? 'Sportsbook',
    details: o.details ?? '',
    homeSpread,
    overUnder: num(o.overUnder),
    homeML: num(o.homeTeamOdds?.moneyLine),
    awayML: num(o.awayTeamOdds?.moneyLine),
    link: o.links?.find((l: any) => /^https/.test(l.href))?.href ?? o.link?.href ?? null,
  };
}

function parseEvent(ev: any): Game {
  const comp = ev.competitions[0];
  const side = (homeAway: string): GameSide => {
    const c = comp.competitors.find((x: any) => x.homeAway === homeAway);
    const stats: Record<string, number> = {};
    for (const s of c.statistics ?? []) {
      const v = num(s.displayValue);
      if (v !== null) stats[s.name] = v;
    }
    return {
      team: parseTeam(c.team),
      score: num(c.score) ?? 0,
      record: c.records?.find((r: any) => r.type === 'total')?.summary ?? '',
      stats,
    };
  };
  const home = side('home');
  const status = comp.status ?? ev.status;
  const clockStr: string = status.displayClock ?? '0:00';
  const [mm, ss] = clockStr.split(':').map((x) => parseFloat(x) || 0);
  return {
    id: String(ev.id),
    date: ev.date,
    state: status.type.state,
    detail: status.type.shortDetail ?? status.type.detail,
    period: status.period ?? 0,
    clock: clockStr.includes(':') ? mm * 60 + ss : mm,
    home,
    away: side('away'),
    odds: parseOdds(comp.odds?.[0], home.team.abbr),
    broadcast: comp.broadcasts?.flatMap((b: any) => b.names ?? []).join(', ') ?? '',
  };
}

export async function fetchScoreboard(date: Date): Promise<Game[]> {
  const data = await getJson(`${SITE}/scoreboard?dates=${yyyymmdd(date)}`);
  return (data.events ?? []).map(parseEvent);
}

export async function fetchGame(id: string): Promise<Game | null> {
  const data = await getJson(`${SITE}/summary?event=${id}`);
  const comp = data.header?.competitions?.[0];
  if (!comp) return null;
  return parseEvent({ id, date: comp.date, competitions: [comp], status: comp.status });
}

export async function fetchSummary(id: string, homeAbbr: string): Promise<GameSummary> {
  const data = await getJson(`${SITE}/summary?event=${id}`);

  const injuries: Record<string, Injury[]> = {};
  for (const t of data.injuries ?? []) {
    injuries[String(t.team.id)] = (t.injuries ?? []).map((i: any) => ({
      athleteId: String(i.athlete?.id ?? ''),
      name: i.athlete?.displayName ?? 'Unknown',
      position: i.athlete?.position?.abbreviation ?? '',
      status: i.status ?? i.type?.description ?? 'Unknown',
      type: i.details?.type ?? '',
      returnDate: i.details?.returnDate,
    }));
  }

  const lastFive: Record<string, RecentGame[]> = {};
  for (const t of data.lastFiveGames ?? []) {
    const teamId = String(t.team.id);
    lastFive[teamId] = (t.events ?? [])
      .filter((e: any) => e.gameResult === 'W' || e.gameResult === 'L')
      .map((e: any) => {
        const isHome = String(e.homeTeamId) === teamId;
        const us = num(isHome ? e.homeTeamScore : e.awayTeamScore) ?? 0;
        const them = num(isHome ? e.awayTeamScore : e.homeTeamScore) ?? 0;
        return {
          result: e.gameResult,
          margin: us - them,
          opponent: e.opponent?.abbreviation ?? '',
          atVs: e.atVs ?? '',
        };
      });
  }

  const box: Record<string, BoxScore> = {};
  for (const t of data.boxscore?.players ?? []) {
    const s = t.statistics?.[0];
    if (!s) continue;
    box[String(t.team.id)] = {
      labels: s.labels ?? s.names ?? [],
      players: (s.athletes ?? []).map((a: any) => ({
        id: String(a.athlete?.id ?? ''),
        name: a.athlete?.shortName ?? a.athlete?.displayName ?? '',
        position: a.athlete?.position?.abbreviation ?? '',
        starter: !!a.starter,
        dnp: a.didNotPlay ? a.reason || 'DNP' : null,
        stats: a.stats ?? [],
      })),
    };
  }

  const wp = data.winprobability;
  const bpi = num(data.predictor?.homeTeam?.gameProjection);
  return {
    bpiHome: bpi === null ? null : bpi / 100,
    liveHomeWP: Array.isArray(wp) && wp.length ? num(wp[wp.length - 1].homeWinPercentage) : null,
    odds: parseOdds(data.pickcenter?.[0], homeAbbr),
    injuries,
    lastFive,
    series: data.seasonseries?.[0]?.summary ?? '',
    box,
  };
}

export async function fetchStandings(): Promise<TeamStanding[]> {
  const data = await getJson(STANDINGS);
  const out: TeamStanding[] = [];
  for (const conf of data.children ?? []) {
    const conference = /east/i.test(conf.name) ? 'East' : 'West';
    for (const e of conf.standings?.entries ?? []) {
      const s: Record<string, any> = {};
      for (const st of e.stats ?? []) s[st.name ?? st.type] = st;
      const v = (k: string) => num(s[k]?.value) ?? 0;
      const find = (label: string) =>
        winLoss((e.stats ?? []).find((x: any) => x.displayName === label || x.name === label)?.displayValue);
      out.push({
        team: parseTeam(e.team),
        conference,
        seed: v('playoffSeed'),
        wins: v('wins'),
        losses: v('losses'),
        winPct: v('winPercent'),
        ppg: v('avgPointsFor'),
        oppPpg: v('avgPointsAgainst'),
        net: v('avgPointsFor') - v('avgPointsAgainst'),
        home: find('Home'),
        road: find('Road'),
        last10: find('Last Ten Games'),
        streak: s.streak?.displayValue ?? '',
      });
    }
  }
  return out.sort((a, b) => a.seed - b.seed);
}

export async function fetchPlayerStats(): Promise<Record<string, PlayerStats>> {
  const data = await getJson(`${PLAYER_STATS}?limit=1000&isqualified=false&sort=offensive.avgPoints:desc`);
  const cats: { name: string; names: string[] }[] = data.categories ?? [];
  const out: Record<string, PlayerStats> = {};
  for (const a of data.athletes ?? []) {
    const vals: Record<string, number> = {};
    for (const c of a.categories ?? []) {
      const names = cats.find((x) => x.name === c.name)?.names ?? [];
      names.forEach((n, i) => (vals[n] = num(c.values?.[i]) ?? 0));
    }
    const id = String(a.athlete?.id);
    out[id] = {
      id,
      name: a.athlete?.displayName ?? '',
      teamId: String(a.athlete?.teamId ?? ''),
      gp: vals.gamesPlayed ?? 0,
      min: vals.avgMinutes ?? 0,
      pts: vals.avgPoints ?? 0,
      reb: vals.avgRebounds ?? 0,
      ast: vals.avgAssists ?? 0,
      stl: vals.avgSteals ?? 0,
      blk: vals.avgBlocks ?? 0,
      tov: vals.avgTurnovers ?? 0,
      fouls: vals.avgFouls ?? 0,
      fgm: vals.avgFieldGoalsMade ?? 0,
      fga: vals.avgFieldGoalsAttempted ?? 0,
      ftm: vals.avgFreeThrowsMade ?? 0,
      fta: vals.avgFreeThrowsAttempted ?? 0,
      tpm: vals.avgThreePointFieldGoalsMade ?? 0,
      tpa: vals.avgThreePointFieldGoalsAttempted ?? 0,
      fgPct: vals.fieldGoalPct ?? 0,
      tpPct: vals.threePointFieldGoalPct ?? 0,
      ftPct: vals.freeThrowPct ?? 0,
      position: a.athlete?.position?.abbreviation ?? '',
    };
  }
  return out;
}

export interface TeamNextGame {
  id: string;
  date: string;
  name: string;
  state: GameState;
}

export async function fetchTeamNextGame(teamId: string): Promise<TeamNextGame | null> {
  const data = await getJson(`${SITE}/teams/${teamId}/schedule`);
  const ev = (data.events ?? []).find((e: any) => e.competitions?.[0]?.status?.type?.state !== 'post');
  if (!ev) return null;
  return { id: String(ev.id), date: ev.date, name: ev.name, state: ev.competitions[0].status.type.state };
}
