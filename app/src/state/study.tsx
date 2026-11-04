// 学習記録（イベントログ）と、そこから求めた履歴・設定を画面に配る
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { AppEvent } from '../domain/events';
import { buildHistory, type History } from '../domain/history';
import { deriveSettings, type Settings } from '../domain/settings';

export interface StudyState {
  events: AppEvent[];
  history: History;
  settings: Settings;
}

const StudyContext = createContext<StudyState | null>(null);

export function StudyProvider({ children }: { children: ReactNode }) {
  const events = useLiveQuery(() => db.events.orderBy('at').toArray(), []);
  const value = useMemo<StudyState | null>(
    () => (events ? { events, history: buildHistory(events), settings: deriveSettings(events) } : null),
    [events],
  );
  if (!value) {
    return (
      <div className="page-loading" role="status">
        読み込み中…
      </div>
    );
  }
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy(): StudyState {
  const v = useContext(StudyContext);
  if (!v) throw new Error('StudyProvider の外で useStudy が呼ばれました');
  return v;
}
