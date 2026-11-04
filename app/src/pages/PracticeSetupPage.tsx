// 演習: 条件と問題数を選んで始める
import { use, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { loadBlueprint, loadQuestionIndex } from '../content/loader';
import type { Difficulty, Qualifier, QuestionMeta } from '../content/types';
import { DIFFICULTY_LABELS, QUALIFIER_LABELS } from '../domain/labels';
import { randomRng } from '../domain/rng';
import {
  EMPTY_FILTER,
  QUESTION_COUNTS,
  filterFromQuery,
  filterPractice,
  pickQuestions,
  practicePool,
  type PracticeFilter,
  type StatusFilter,
} from '../domain/selection';
import { useStudy } from '../state/study';
import { createPracticeSession } from '../state/sessions';

const STATUS_LABELS: Record<StatusFilter, string> = {
  unanswered: '未回答',
  wrong: '前回誤答',
  flagged: 'フラグ付き',
};

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function ChipGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  label,
}: {
  legend: string;
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  label: (v: T) => string;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="chips">
        {options.map((o) => (
          <label key={String(o)} className="chip">
            <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(toggle(value, o))} />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function countBy(pool: QuestionMeta[], key: (q: QuestionMeta) => string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const q of pool) for (const k of key(q)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function PracticeSetupPage() {
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const { history } = useStudy();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<PracticeFilter>(() => filterFromQuery(params));
  const [count, setCount] = useState<number>(10);
  const [serviceQuery, setServiceQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const pool = useMemo(() => practicePool(index), [index]);
  const matched = useMemo(() => filterPractice(index, filter, history), [index, filter, history]);
  const services = useMemo(() => countBy(pool, (q) => q.services), [pool]);
  const taskCounts = useMemo(() => new Map(countBy(pool, (q) => [q.taskStatement])), [pool]);
  const domains = blueprint?.domains ?? [];
  const tasks = domains.flatMap((d) => d.tasks).filter((t) => filter.domains.length === 0 || filter.domains.includes(t.domain));
  const set = <K extends keyof PracticeFilter>(k: K, v: PracticeFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const filteredServices = services.filter(([s]) => s.toLowerCase().includes(serviceQuery.trim().toLowerCase()));
  const take = Math.min(count, matched.length);

  async function start() {
    if (take === 0 || busy) return;
    setBusy(true);
    const ids = pickQuestions(matched, history, count, randomRng());
    const id = await createPracticeSession({ mode: 'practice', title: '演習', questionIds: ids });
    navigate(`/session/${id}`);
  }

  return (
    <div>
      <h1>演習</h1>
      <p className="muted">条件と問題数を選んで解きます。選択肢の順番は毎回入れ替わります。</p>
      {pool.length === 0 ? (
        <div className="notice warn">演習問題はまだありません。コンテンツが追加されるのをお待ちください。</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <div className="card">
            <ChipGroup
              legend="ドメイン"
              options={domains.map((d) => d.id)}
              value={filter.domains}
              onChange={(v) => setFilter((f) => ({ ...f, domains: v, tasks: [] }))}
              label={(id) => `${id}. ${domains.find((d) => d.id === id)?.nameJa ?? ''}`}
            />
            <details className="filter">
              <summary>タスク{filter.tasks.length ? `（${filter.tasks.length} 件選択中）` : ''}</summary>
              <ChipGroup
                legend="タスク"
                options={tasks.map((t) => t.id)}
                value={filter.tasks}
                onChange={(v) => set('tasks', v)}
                label={(id) => `${id} ${tasks.find((t) => t.id === id)?.titleJa ?? ''}（${taskCounts.get(id) ?? 0}）`}
              />
            </details>
            <details className="filter">
              <summary>サービス{filter.services.length ? `（${filter.services.length} 件選択中）` : ''}</summary>
              <label className="field">
                <span>サービス名で絞り込む</span>
                <input type="search" value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)} placeholder="例: S3" />
              </label>
              <ChipGroup
                legend="サービス"
                options={filteredServices.slice(0, 60).map(([s]) => s)}
                value={filter.services}
                onChange={(v) => set('services', v)}
                label={(s) => `${s}（${services.find(([x]) => x === s)?.[1] ?? 0}）`}
              />
            </details>
            <ChipGroup<Qualifier>
              legend="判断軸"
              options={(blueprint?.qualifiers ?? (Object.keys(QUALIFIER_LABELS) as Qualifier[])).filter((q) => q !== 'other')}
              value={filter.qualifiers}
              onChange={(v) => set('qualifiers', v)}
              label={(q) => QUALIFIER_LABELS[q]}
            />
            <ChipGroup<Difficulty>
              legend="難易度"
              options={[1, 2, 3]}
              value={filter.difficulties}
              onChange={(v) => set('difficulties', v)}
              label={(d) => DIFFICULTY_LABELS[d] ?? String(d)}
            />
            <ChipGroup<StatusFilter>
              legend="回答状況（いずれかに当てはまる問題）"
              options={['unanswered', 'wrong', 'flagged']}
              value={filter.statuses}
              onChange={(v) => set('statuses', v)}
              label={(s) => STATUS_LABELS[s]}
            />
            <fieldset>
              <legend>問題数</legend>
              <div className="chips">
                {QUESTION_COUNTS.map((n) => (
                  <label key={n} className="chip">
                    <input type="radio" name="count" checked={count === n} onChange={() => setCount(n)} />
                    {n} 問
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="sticky-actions">
            <span className="hint" aria-live="polite">
              条件に合う問題: {matched.length} 問（演習問題 全 {pool.length} 問）
            </span>
            <button type="button" className="btn" onClick={() => setFilter(EMPTY_FILTER)}>
              条件をクリア
            </button>
            <button type="submit" className="btn primary" disabled={take === 0 || busy}>
              {take > 0 ? `${take} 問を解く` : '該当なし'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
