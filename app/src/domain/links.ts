// 外部サービスへのリンク（AI に質問・誤りの報告）
import type { Question } from '../content/types';
import { LETTERS, lettersFor } from './grading';

export const REPO_URL = 'https://github.com/Uni-K-Pip/saa-dojo';

/** 問題文・選択肢（表示順）・自分の回答をまとめた質問文 */
export function askText(q: Pick<Question, 'stem' | 'options' | 'type' | 'selectCount'>, order: readonly string[], selected: readonly string[]): string {
  const byId = new Map(q.options.map((o) => [o.id, o]));
  const lines = order.map((id, i) => `${LETTERS[i]}. ${byId.get(id)?.text ?? ''}`);
  const mine = selected.length ? lettersFor(order, selected) : '（未回答）';
  const kind = q.type === 'multiple' ? `（${q.selectCount}つ選択）` : '';
  return [
    'AWS 認定ソリューションアーキテクト – アソシエイト（SAA-C03）の練習問題です。正解とその理由、ほかの選択肢が誤りである理由を解説してください。',
    '',
    `問題${kind}:`,
    q.stem,
    '',
    '選択肢:',
    ...lines,
    '',
    `私の回答: ${mine}`,
  ].join('\n');
}

export function chatGptUrl(text: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(text)}`;
}

export function claudeUrl(text: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(text)}`;
}

/** GitHub の Issue 作成画面（タイトルは問題 ID） */
export function reportUrl(q: Pick<Question, 'id' | 'stem'>): string {
  const excerpt = Array.from(q.stem).slice(0, 120).join('') + (Array.from(q.stem).length > 120 ? '…' : '');
  const body = [`問題 ID: ${q.id}`, '', '誤りの内容:', '（どこがどう誤っているか、根拠となる AWS 公式ドキュメントの URL があれば書いてください）', '', `問題文（冒頭）: ${excerpt}`].join('\n');
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(q.id)}&body=${encodeURIComponent(body)}`;
}
