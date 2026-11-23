import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { loadSimIndex } from '../content/loader';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  group: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'ホーム', icon: '⌂', group: '' },
  { to: '/course', label: '学習コース', icon: '🧭', group: '学ぶ' },
  { to: '/basics', label: '基礎講座', icon: '🔰', group: '学ぶ' },
  { to: '/roadmap', label: 'ロードマップ', icon: '🗺', group: '学ぶ' },
  { to: '/practice', label: '演習', icon: '✎', group: '解く' },
  { to: '/mock', label: '模擬試験', icon: '⏱', group: '解く' },
  { to: '/review', label: '復習', icon: '↻', group: '解く' },
  { to: '/drill', label: '判断軸ドリル', icon: '⚡', group: '解く' },
  { to: '/flashcards', label: 'フラッシュカード', icon: '🃏', group: '覚える' },
  { to: '/services', label: 'サービス図鑑', icon: '☁', group: '調べる' },
  { to: '/glossary', label: '用語集', icon: '📖', group: '調べる' },
  { to: '/docs', label: '早見表・ガイド', icon: '📑', group: '調べる' },
  { to: '/readiness', label: '合格準備度', icon: '🎯', group: '確かめる' },
  { to: '/analysis', label: '弱点分析', icon: '📊', group: '確かめる' },
  { to: '/settings', label: '設定', icon: '⚙', group: 'その他' },
  { to: '/about', label: 'このアプリについて', icon: 'ℹ', group: 'その他' },
];

export const SIM_NAV_ITEM: NavItem = { to: '/sims', label: 'シミュレーター', icon: '▦', group: '学ぶ' };

export function menuItems(hasSims: boolean): NavItem[] {
  if (!hasSims) return NAV_ITEMS;
  return NAV_ITEMS.flatMap((item) => item.to === '/roadmap' ? [item, SIM_NAV_ITEM] : [item]);
}

const BOTTOM: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'ホーム', icon: '⌂' },
  { to: '/course', label: '学ぶ', icon: '🧭' },
  { to: '/practice', label: '演習', icon: '✎' },
  { to: '/review', label: '復習', icon: '↻' },
  { to: '/menu', label: 'メニュー', icon: '☰' },
];

function SideNav({ hasSims }: { hasSims: boolean }) {
  let lastGroup = '';
  const items: ReactNode[] = [];
  for (const item of menuItems(hasSims)) {
    if (item.group && item.group !== lastGroup) {
      items.push(
        <li key={`g-${item.group}`} className="nav-group" aria-hidden="true">
          {item.group}
        </li>,
      );
      lastGroup = item.group;
    }
    items.push(
      <li key={item.to}>
        <NavLink to={item.to} end={item.to === '/'}>
          {item.label}
        </NavLink>
      </li>,
    );
  }
  return (
    <nav className="side-nav" aria-label="メインメニュー">
      <ul>{items}</ul>
    </nav>
  );
}

export function Layout({ toast }: { toast?: ReactNode }) {
  const location = useLocation();
  const [hasSims, setHasSims] = useState(false);
  // 出すシナリオがあるときだけ、横のナビにシミュレーターを出す。一覧のデータは最初の描画のあとに読む（初期表示を待たせない）
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      loadSimIndex()
        .then((list) => {
          if (alive && list.some(({ scenarios }) => scenarios.length > 0)) setHasSims(true);
        })
        .catch(() => {});
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        本文へ移動
      </a>
      <header className="app-header">
        <NavLink to="/" className="brand">
          SAA Dojo
        </NavLink>
        <span className="badge info">非公式</span>
        <span className="header-spacer" />
        <NavLink to="/settings" className="btn small" aria-label="設定">
          ⚙
        </NavLink>
      </header>
      <div className="app-body">
        <SideNav hasSims={hasSims} />
        <main id="main" className="main" tabIndex={-1}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense
              fallback={
                <div className="page-loading" role="status">
                  読み込み中…
                </div>
              }
            >
              <Outlet context={setHasSims} />
            </Suspense>
          </ErrorBoundary>
          <footer className="app-footer">
            非公式の学習アプリです。Amazon Web Services, Inc. およびその関連会社とは関係ありません。
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="主なメニュー">
        {BOTTOM.map((b) => (
          <NavLink key={b.to} to={b.to} end={b.to === '/'}>
            <span className="nav-icon" aria-hidden="true">
              {b.icon}
            </span>
            <span>{b.label}</span>
          </NavLink>
        ))}
      </nav>
      {toast}
    </div>
  );
}
