// 設定: 試験日、1日の目標、テーマ、文字サイズ、フラッシュカード、書き出し・読み込み、リセット、同期
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { appendEvent, getAllEvents, getDeviceId, LAST_BACKUP_KEY, mergeEvents, resetAllData, setMeta } from '../db/repo';
import { backupFileName, makeBackup, parseBackup } from '../domain/backup';
import type { FontSizeSetting, SettingKey, Settings, ThemeSetting } from '../domain/settings';
import { useStudy } from '../state/study';

const SyncSection = lazy(() => import('../components/SyncSection'));

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: '端末に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];
const FONT_SIZES: { value: FontSizeSetting; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
  { value: 'xlarge', label: '特大' },
];

function useSetting() {
  const { settings } = useStudy();
  return <K extends SettingKey>(key: K, value: Settings[K]) => {
    if (settings[key] === value) return;
    void appendEvent({ type: 'setting', key, value });
  };
}

function GeneralSection() {
  const { settings } = useStudy();
  const set = useSetting();
  const [goal, setGoal] = useState(settings.dailyGoal ? String(settings.dailyGoal) : '');
  const [cards, setCards] = useState(String(settings.newCardsPerDay));
  const commitGoal = () => {
    const n = Number(goal);
    if (goal.trim() === '') set('dailyGoal', null);
    else if (Number.isInteger(n) && n >= 1 && n <= 500) set('dailyGoal', n);
    else setGoal(settings.dailyGoal ? String(settings.dailyGoal) : '');
  };
  const commitCards = () => {
    const n = Number(cards);
    if (Number.isInteger(n) && n >= 0 && n <= 200) set('newCardsPerDay', n);
    else setCards(String(settings.newCardsPerDay));
  };
  return (
    <section className="card" aria-labelledby="general-h">
      <h2 id="general-h">学習</h2>
      <label className="field">
        <span>試験日</span>
        <input type="date" value={settings.examDate ?? ''} onChange={(e) => set('examDate', e.target.value || null)} />
      </label>
      <label className="field">
        <span>1日の目標（問題数。空欄なら試験日から逆算）</span>
        <input type="number" inputMode="numeric" min={1} max={500} value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={commitGoal} placeholder="自動" />
      </label>
      <label className="field">
        <span>フラッシュカードの1日あたりの新しいカード</span>
        <input type="number" inputMode="numeric" min={0} max={200} value={cards} onChange={(e) => setCards(e.target.value)} onBlur={commitCards} />
      </label>
    </section>
  );
}

function AppearanceSection() {
  const { settings } = useStudy();
  const set = useSetting();
  return (
    <section className="card" aria-labelledby="appearance-h">
      <h2 id="appearance-h">表示</h2>
      <fieldset>
        <legend>テーマ</legend>
        <div className="chips">
          {THEMES.map((t) => (
            <label key={t.value} className="chip">
              <input type="radio" name="theme" checked={settings.theme === t.value} onChange={() => set('theme', t.value)} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>文字サイズ</legend>
        <div className="chips">
          {FONT_SIZES.map((f) => (
            <label key={f.value} className="chip">
              <input type="radio" name="font-size" checked={settings.fontSize === f.value} onChange={() => set('fontSize', f.value)} />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function BackupSection() {
  const { events } = useStudy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  async function exportAll() {
    const now = Date.now();
    const backup = makeBackup(await getAllEvents(), await getDeviceId(), now);
    download(backupFileName(now), JSON.stringify(backup));
    await setMeta(LAST_BACKUP_KEY, now);
    setMessage({ kind: 'ok', text: `${backup.events.length} 件の記録を書き出しました。` });
  }

  async function importFile(file: File) {
    const r = parseBackup(await readText(file));
    if (!r.ok) {
      setMessage({ kind: 'error', text: `読み込めませんでした: ${r.error}` });
      return;
    }
    const added = await mergeEvents(r.events);
    setMessage({
      kind: 'ok',
      text: `${added} 件の記録を追加しました（すでにあった記録 ${r.events.length - added} 件${r.skipped ? `・形式の合わない記録 ${r.skipped} 件` : ''}は除きました）。`,
    });
  }

  return (
    <section className="card" aria-labelledby="backup-h">
      <h2 id="backup-h">書き出し・読み込み</h2>
      <p className="small muted">
        学習記録（{events.length} 件）はこのブラウザにだけ保存されています。週に1回は書き出すか、下の同期を使ってください。読み込むと、いまの記録に足し合わされます（同じ記録は重複しません）。
      </p>
      {persisted === false && <p className="notice warn small">このブラウザでは保存領域が永続化されていません。空き容量が減ると記録が消されることがあります。</p>}
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => void exportAll()}>
          JSON で書き出す
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          ファイルから読み込む
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,.ndjson,.jsonl"
          className="visually-hidden"
          aria-label="読み込むファイル"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
      </div>
      {message && (
        <p className={`notice ${message.kind === 'ok' ? 'ok' : 'error'}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}

function ResetSection() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [agree, setAgree] = useState(false);
  return (
    <section className="card" aria-labelledby="reset-h">
      <h2 id="reset-h">リセット</h2>
      <p className="small muted">
        この端末の学習記録・設定・途中のセッションをすべて消します。元に戻せないので、先に書き出してください。同期を使っている場合、Gist の記録は消えず、次の同期で戻ります。
      </p>
      {step === 'idle' && (
        <button type="button" className="btn danger" onClick={() => setStep('confirm')}>
          すべての記録を消す…
        </button>
      )}
      {step === 'confirm' && (
        <div className="notice error">
          <label className="chip">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            元に戻せないことを理解しました
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn danger"
              disabled={!agree}
              onClick={async () => {
                await resetAllData();
                setStep('done');
                setAgree(false);
              }}
            >
              消す
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStep('idle');
                setAgree(false);
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <p className="notice ok" role="status">
          すべての記録を消しました。
        </p>
      )}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <h1>設定</h1>
      <GeneralSection />
      <AppearanceSection />
      <BackupSection />
      <Suspense fallback={<div className="card">読み込み中…</div>}>
        <SyncSection />
      </Suspense>
      <ResetSection />
    </div>
  );
}
