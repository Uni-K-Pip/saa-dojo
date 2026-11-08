// 週1回の書き出しか同期を促す（端末のデータが消えても学習記録を失わないように）
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { LAST_BACKUP_KEY } from '../db/repo';
import { useStudy } from '../state/study';

export const BACKUP_INTERVAL_MS = 7 * 86_400_000;

export function needsBackup(firstEventAt: number | null, lastBackupAt: number | null, now: number): boolean {
  if (firstEventAt === null) return false;
  const since = lastBackupAt ?? firstEventAt;
  return now - since >= BACKUP_INTERVAL_MS;
}

export function BackupReminder() {
  const { events } = useStudy();
  const last = useLiveQuery(async () => {
    const v = (await db.meta.get(LAST_BACKUP_KEY))?.value;
    return typeof v === 'number' ? v : null;
  }, []);
  if (last === undefined) return null;
  const first = events.length ? Math.min(...events.map((e) => e.at)) : null;
  if (!needsBackup(first, last, Date.now())) return null;
  return (
    <div className="notice warn" role="status">
      {last ? `最後の書き出し・同期から1週間以上たっています。` : '学習記録はこの端末のブラウザにだけ保存されています。'}
      ブラウザのデータが消えても記録を失わないよう、<Link to="/settings">設定</Link>で書き出すか同期してください。
    </div>
  );
}
