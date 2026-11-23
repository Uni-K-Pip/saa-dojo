export const lessonId = 'lesson-4.1-s3-storage-classes';
const common = {
  title: '検査用の図',
  alt: '図の上から順に、各項目の位置やつながりを読みます。隣り合う項目は内容に応じて並べてあり、図の下には補足が続きます。項目の順序と関係がわかるよう、文字と形を組み合わせています。',
  lessonRefs: [lessonId],
  factRefs: [],
  createdBy: 'v1',
};

export const result = (id, extra = {}) => ({ id, result: '結論の名前', why: '条件を満たす仕組みを利用できます。', ...extra });
export const ask = (id, yes, no) => ({
  id, ask: '条件を満たしますか？', choices: [{ label: 'はい', to: yes }, { label: 'いいえ', to: no }],
});

export function decision() {
  return {
    ...common, id: 'dg-test-decision', type: 'decision', start: 'root',
    nodes: [result('last'), ask('next', 'first', 'second'), result('second'), ask('root', 'next', 'last'), result('first', { service: 's3' })],
  };
}

export function position() {
  return {
    ...common, id: 'dg-test-position', type: 'position',
    x: { label: '待ち時間', low: '短い', high: '長い' },
    y: { label: '保管料金', low: '安い', high: '高い' },
    items: [
      { id: 'first', label: '長い名前を凡例に出すために使う位置の項目です', x: 3, y: 5, service: 's3' },
      { id: 'second', label: '短い名前', x: 3, y: 3, note: '補足の文です。' },
    ],
  };
}

export function timeline() {
  return {
    ...common, id: 'dg-test-timeline', type: 'timeline',
    ticks: [{ at: 0, label: '作成' }, { at: 7, label: '七日目' }, { at: 90, label: '九十日目' }],
    lanes: [{ label: 'オブジェクト', spans: [{ from: 0, to: 90, label: '最初の保存クラス' }], marks: [{ at: 90, label: '削除' }] }],
  };
}

export function layers() {
  return {
    ...common, id: 'dg-test-layers', type: 'layers',
    columns: ['サーバー', '関数'],
    rows: [{ label: 'アプリ', cells: ['you', 'you'] }, { label: '実行環境', cells: ['you', 'cloud'] }],
    legend: { you: '利用者が管理', cloud: 'AWS が管理' },
  };
}

export function architecture() {
  return {
    ...common, id: 'dg-test-architecture', type: 'architecture',
    root: { dir: 'col', children: [{ id: 'user', node: 'actor' }, { id: 'storage', node: 's3' }] },
    edges: [{ id: 'request', from: 'user', to: 'storage' }],
    steps: [{ text: 'テストの段階を表示して、前後に移動できることを確かめます。', edges: ['request'] }],
  };
}
