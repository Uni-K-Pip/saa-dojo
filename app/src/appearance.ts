// テーマと文字サイズを <html> に反映する。起動直後のちらつきを防ぐため、この端末の localStorage にも控える。
import type { FontSizeSetting, ThemeSetting } from './domain/settings';

export const APPEARANCE_KEY = 'saa-dojo:appearance';

export function applyAppearance(theme: ThemeSetting, fontSize: FontSizeSetting): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (fontSize === 'medium') delete root.dataset.font;
  else root.dataset.font = fontSize;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme, fontSize }));
  } catch {
    // 保存できなくても表示には影響しない
  }
}
