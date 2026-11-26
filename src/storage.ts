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
