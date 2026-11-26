export const C = {
  bg: '#05060A',
  card: '#0E1118',
  cardHi: '#151A25',
  line: '#1F2533',
  text: '#F2F4F8',
  dim: '#8A93A6',
  faint: '#596277',
  blue: '#2F6BFF',
  red: '#E8243F',
  green: '#22C55E',
  amber: '#F5B83D',
  kalshi: '#00D395',
};

export const pctText = (p: number) => `${Math.round(p * 100)}%`;
export const xText = (m: number | null) => (m === null ? '—' : `${m.toFixed(2)}x`);
