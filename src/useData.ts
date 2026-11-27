import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGame,
  fetchPlayerStats,
  fetchScoreboard,
  fetchStandings,
  fetchSummary,
  type Game,
  type GameSummary,
  type PlayerStats,
  type TeamStanding,
} from './api';
import { fetchKalshiGames, type KalshiGame } from './kalshi';
import { predict, type Prediction } from './model';
import { getLog, saveLog } from './storage';

export interface DayData {
  games: Game[];
  summaries: Record<string, GameSummary>;
  predictions: Record<string, Prediction>;
  kalshi: Record<string, KalshiGame>;
}

export interface LeagueData {
  standings: Record<string, TeamStanding>;
  standingsList: TeamStanding[];
  players: Record<string, PlayerStats>;
}

const LIVE_REFRESH_MS = 30_000;
export const KALSHI_REFRESH_MS = 15_000;

export function useLeague() {
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([fetchStandings(), fetchPlayerStats()])
      .then(([list, players]) =>
        setLeague({ standingsList: list, standings: Object.fromEntries(list.map((s) => [s.team.id, s])), players }),
      )
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  return { league, error };
}

export function useDay(date: Date, league: LeagueData | null) {
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = date.toDateString();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    setError(null);
    try {
      const yesterday = new Date(date);
      yesterday.setDate(date.getDate() - 1);
      const [games, prev] = await Promise.all([fetchScoreboard(date), fetchScoreboard(yesterday)]);
      const playedYesterday = new Set(prev.flatMap((g) => [g.home.team.id, g.away.team.id]));
      const [summaryList, kalshi] = await Promise.all([
        Promise.all(games.map((g) => fetchSummary(g.id, g.home.team.abbr).catch(() => undefined))),
        fetchKalshiGames(games).catch(() => ({}) as Record<string, KalshiGame>),
      ]);
      const summaries: Record<string, GameSummary> = {};
      const predictions: Record<string, Prediction> = {};
      games.forEach((g, i) => {
        const summary = summaryList[i];
        if (summary) summaries[g.id] = summary;
        predictions[g.id] = predict(g, { ...league, playedYesterday, summary });
      });
      setData({ games, summaries, predictions, kalshi });
      await recordPicks(games, predictions);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, league]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // Auto-refresh while any game is live
  const anyLive = !!data?.games.some((g) => g.state === 'in');
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (anyLive) timer.current = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [anyLive, load]);

  // Kalshi prices move constantly: refresh them on their own, faster than the full reload
  const gamesRef = useRef<Game[]>([]);
  gamesRef.current = data?.games ?? [];
  const gameIds = gamesRef.current.map((g) => g.id).join();
  useEffect(() => {
    if (!gameIds) return;
    const id = setInterval(() => {
      const games = gamesRef.current;
      fetchKalshiGames(games)
        .then((kalshi) => setData((d) => (d && d.games === games ? { ...d, kalshi } : d)))
        .catch(() => {});
    }, KALSHI_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameIds]);

  return { data, loading, error, reload: load };
}

// Save the pregame pick for each game, and grade picks once games end.
// Only picks made before tip-off count toward the record.
async function recordPicks(games: Game[], predictions: Record<string, Prediction>) {
  const log = await getLog();
  for (const g of games) {
    const p = predictions[g.id];
    if (g.state === 'pre') {
      const pickHome = p.pickTeamId === g.home.team.id;
      log[g.id] = {
        gameId: g.id,
        date: g.date,
        matchup: `${g.away.team.abbr} @ ${g.home.team.abbr}`,
        pickTeamId: p.pickTeamId,
        pickAbbr: pickHome ? g.home.team.abbr : g.away.team.abbr,
        prob: pickHome ? p.homeWinProb : 1 - p.homeWinProb,
      };
    } else if (g.state === 'post' && log[g.id] && !log[g.id].result) {
      const winner = g.home.score > g.away.score ? g.home.team.id : g.away.team.id;
      log[g.id].result = winner === log[g.id].pickTeamId ? 'W' : 'L';
    }
  }
  await saveLog(log);
}

// Grade picks from days the user didn't open again
export async function gradeOldPicks() {
  const log = await getLog();
  const pending = Object.values(log).filter((p) => !p.result && Date.now() - new Date(p.date).getTime() > 4 * 3600_000);
  for (const p of pending.slice(0, 25)) {
    const g = await fetchGame(p.gameId).catch(() => null);
    if (g?.state === 'post') {
      const winner = g.home.score > g.away.score ? g.home.team.id : g.away.team.id;
      log[p.gameId].result = winner === p.pickTeamId ? 'W' : 'L';
    }
  }
  await saveLog(log);
  return log;
}
