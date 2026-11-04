// 設定（設定変更イベントの最新値から求める）
import { compareEvents, type AppEvent } from './events';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type FontSizeSetting = 'small' | 'medium' | 'large' | 'xlarge';

export interface Settings {
  /** 試験日（YYYY-MM-DD） */
  examDate: string | null;
  /** 1日の目標（問題数）。null なら試験日から逆算する */
  dailyGoal: number | null;
  theme: ThemeSetting;
  fontSize: FontSizeSetting;
  unlockMockA: boolean;
  unlockMockB: boolean;
  /** フラッシュカードの1日あたりの新しいカード数 */
  newCardsPerDay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  examDate: null,
  dailyGoal: null,
  theme: 'system',
  fontSize: 'medium',
  unlockMockA: false,
  unlockMockB: false,
  newCardsPerDay: 20,
};

export type SettingKey = keyof Settings;

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;

// 不正な値は無視する（他の端末・新しい版の値でも壊れないように）
const PARSERS: { [K in SettingKey]: (v: unknown) => Settings[K] | undefined } = {
  examDate: (v) => (v === null || isDate(v) ? v : undefined),
  dailyGoal: (v) => (v === null || isCount(v, 500) ? v : undefined),
  theme: (v) => (v === 'system' || v === 'light' || v === 'dark' ? v : undefined),
  fontSize: (v) => (v === 'small' || v === 'medium' || v === 'large' || v === 'xlarge' ? v : undefined),
  unlockMockA: (v) => (typeof v === 'boolean' ? v : undefined),
  unlockMockB: (v) => (typeof v === 'boolean' ? v : undefined),
  newCardsPerDay: (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 200 ? v : undefined),
};

export function deriveSettings(events: readonly AppEvent[]): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  const list = events.filter((e) => e.type === 'setting').sort(compareEvents);
  for (const e of list) {
    if (e.type !== 'setting' || !(e.key in PARSERS)) continue;
    const key = e.key as SettingKey;
    const v = PARSERS[key](e.value);
    if (v !== undefined) (s as unknown as Record<string, unknown>)[key] = v;
  }
  return s;
}
