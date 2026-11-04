import { Suspense, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  group: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'ホーム', icon: '⌂', group: '' },
  { to: '/basics', label: '基礎講座', icon: '🔰', group: '学ぶ' },
  { to: '/roadmap', label: 'ロードマップ', icon: '🗺', group: '学ぶ' },
  { to: '/practice', label: '演習', icon: '✎', group: '解く' },
  { to: '/mock', label: '模擬試験', icon: '⏱', group: '解く' },
  { to: '/review', label: '復習', icon: '↻', group: '解く' },
  { to: '/drill', label: '判断軸ドリル', icon: '⚡', group: '解く' },
  { to: '/flashcards', label: 'フラッシュカード', icon: '🃏', group: '覚える' },
  { to: '/glossary', label: '用語集', icon: '📖', group: '調べる' },
  { to: '/docs', label: '早見表・ガイド', icon: '📑', group: '調べる' },
  { to: '/readiness', label: '合格準備度', icon: '🎯', group: '確かめる' },
  { to: '/analysis', label: '弱点分析', icon: '📊', group: '確かめる' },
  { to: '/settings', label: '設定', icon: '⚙', group: 'その他' },
  { to: '/about', label: 'このアプリについて', icon: 'ℹ', group: 'その他' },
];

const BOTTOM: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'ホーム', icon: '⌂' },
  { to: '/roadmap', label: '学ぶ', icon: '🗺' },
  { to: '/practice', label: '演習', icon: '✎' },
  { to: '/review', label: '復習', icon: '↻' },
  { to: '/menu', label: 'メニュー', icon: '☰' },
];

function SideNav() {
  let lastGroup = '';
  const items: ReactNode[] = [];
  for (const item of NAV_ITEMS) {
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
        <SideNav />
        <main id="main" className="main" tabIndex={-1}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense
              fallback={
                <div className="page-loading" role="status">
                  読み込み中…
                </div>
              }
            >
              <Outlet />
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
