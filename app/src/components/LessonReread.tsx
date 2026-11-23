export const NO_REREAD_LESSONS = '読み直すとよいレッスンはありません（その場の確認で間違えたレッスンがここに出ます）';

export function LessonRereadBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="badge pending">
      <span aria-hidden="true">読み直し</span>
      <span className="visually-hidden">読み直し候補: その場の確認で {count} 問間違えています</span>
    </span>
  );
}

export function LessonRereadFilter({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <p>
      <label className="chip">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        読み直すとよいレッスン
      </label>
    </p>
  );
}
