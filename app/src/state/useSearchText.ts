// URL の検索語（`?q=` など）と結びつけた文字の入力
// 入力の値は画面の状態に持ち、URL はそこから追いかけて書き換える。
// React Router は位置の更新を transition で行うので、入力の値を URL から直接取ると、
// transition の確定より先に次の文字が来たときに、その間の文字が消える。
// 戻る・進む、`?q=` つきのリンクなど、外から URL が変わったときは、入力を URL に合わせる。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

type Mark = { token: string; seq: number };
const MARK = 'searchText';

function markOf(state: unknown): Mark | undefined {
  const mark = (state as Record<string, unknown> | null)?.[MARK];
  if (!mark || typeof mark !== 'object') return undefined;
  const { token, seq } = mark as Partial<Mark>;
  return typeof token === 'string' && typeof seq === 'number' ? { token, seq } : undefined;
}

export type SearchParamChanges = Record<string, string | null>;

/**
 * @returns `text`（入力の値）、`setText`（入力が変わったとき）、`update`（ほかの絞り込みを URL に書く。検索語は今の入力の値を書く）、`params`（今の URL の検索の部分）
 */
export function useSearchText(key = 'q') {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const fromUrl = params.get(key) ?? '';
  const [text, setTextState] = useState(fromUrl);
  // この画面が書いた位置の更新には印（token と連番）を付け、外からの変更と見分ける
  const token = useRef(Math.random().toString(36).slice(2));
  const seq = useRef(0);
  const acked = useRef(0);
  const latest = useRef(fromUrl);
  // 最後に書いた（または外から来た）検索の部分。確定前の更新に、次の更新を重ねるために持つ
  const pending = useRef(params);

  useEffect(() => {
    const mark = markOf(location.state);
    if (mark?.token === token.current && mark.seq > acked.current) {
      // 自分が書いた更新が確定した（途中の値のこともある）。入力はもっと新しいので、そのままにする
      acked.current = mark.seq;
      return;
    }
    pending.current = params;
    // 同じ値のときは状態を書き換えない（読み込み直後など。余計な描画をしない）
    if (fromUrl === latest.current) return;
    latest.current = fromUrl;
    setTextState(fromUrl);
    // 位置が変わったときだけ見る（同じ位置の描画のたびに入力を戻さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const write = useCallback((changes: SearchParamChanges) => {
    const next = new URLSearchParams(pending.current);
    for (const [k, v] of Object.entries({ ...changes, [key]: latest.current || null })) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    pending.current = next;
    seq.current += 1;
    setParams(next, { replace: true, state: { [MARK]: { token: token.current, seq: seq.current } } });
  }, [key, setParams]);

  const setText = useCallback((value: string) => {
    latest.current = value;
    setTextState(value);
    write({});
  }, [write]);

  return { text, setText, update: write, params };
}
