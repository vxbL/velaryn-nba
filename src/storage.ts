import AsyncStorage from '@react-native-async-storage/async-storage';

const FAV = 'velaryn.favoriteTeam';
const LOG = 'velaryn.predictionLog';

export interface LoggedPick {
  gameId: string;
  date: string;
  matchup: string; // "MIA @ NY"
  pickTeamId: string;
  pickAbbr: string;
  prob: number;
  result?: 'W' | 'L';
}

const BETS = 'velaryn.lockedBets';

export interface LockedLeg {
  ticker: string;
  side: 'YES' | 'NO';
  label: string;
  game: string;
  kind: string;
  entryPrice: number; // dollars per contract when locked
  prob: number; // Velaryn probability when locked
  url: string;
}

export interface LockedBet {
  id: string;
  createdAt: string;
  stake: number;
  payout: number; // what it pays if every leg hits (editable to match Kalshi's quote)
  legs: LockedLeg[];
}

export async function getBets(): Promise<LockedBet[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(BETS)) ?? '[]');
  } catch {
    return [];
  }
}

export async function saveBets(bets: LockedBet[]) {
  try {
    await AsyncStorage.setItem(BETS, JSON.stringify(bets));
  } catch {}
}

export async function getFavorite(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(FAV);
  } catch {
    return null;
  }
}

export async function setFavorite(teamId: string | null) {
  try {
    if (teamId) await AsyncStorage.setItem(FAV, teamId);
    else await AsyncStorage.removeItem(FAV);
  } catch {}
}

export async function getLog(): Promise<Record<string, LoggedPick>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOG)) ?? '{}');
  } catch {
    return {};
  }
}

export async function saveLog(log: Record<string, LoggedPick>) {
  try {
    await AsyncStorage.setItem(LOG, JSON.stringify(log));
  } catch {}
}
