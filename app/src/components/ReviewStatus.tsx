// 既存の教材（レッスン・早見表・ガイド・カード・用語）の検証状態の札と「修正待ち」の注意。
// 未検証でも表示する。レッスン・早見表・ガイドは needs-fix・rejected でも表示を続け、本文の上に注意を出す
// （カードと用語の needs-fix・rejected はビルドが出さない）。
import type { ReviewStatus } from '../content/types';

export const needsRevision = (status?: ReviewStatus): boolean => status === 'needs-fix' || status === 'rejected';

/** 本文の画面の札（未検証か修正待ち。検証済みは何も出さない） */
export function ReviewBadge({ status, label }: { status?: ReviewStatus; label: string }) {
  if (needsRevision(status)) return <span className="badge ng" title={`内容の確認で直すところが見つかった${label}です`}>修正待ち</span>;
  if (status === 'pending') return <span className="badge pending" title={`内容の検証がまだ終わっていない${label}です`}>未検証</span>;
  return null;
}

/** 一覧の札（修正待ちだけ。未検証は一覧に出さない） */
export function RevisionBadge({ status }: { status?: ReviewStatus }) {
  return needsRevision(status) ? <span className="badge ng">修正待ち</span> : null;
}

/** 本文の上の注意（修正待ちのときだけ） */
export function RevisionNotice({ status, label }: { status?: ReviewStatus; label: string }) {
  if (!needsRevision(status)) return null;
  return (
    <div className="notice warn" role="note">
      <strong>修正待ち</strong>: この{label}は、内容の確認で直すところが見つかり、修正を待っています。
      直るまでは、サービス図鑑や AWS の公式ドキュメントでも確かめながら読んでください。
    </div>
  );
}
