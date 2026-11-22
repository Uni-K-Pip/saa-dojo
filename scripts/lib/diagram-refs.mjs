// 検査と Markdown 表示で同じ参照の形を使います。
const DIAGRAM_LINK = /^#\/diagrams\/(dg-[a-z0-9][a-z0-9-]{1,60})(?:\?step=([0-9]+))?$/;

export function diagramRefOf(href) {
  const match = DIAGRAM_LINK.exec(href);
  return match ? { id: match[1], step: match[2] === undefined ? undefined : Number(match[2]) } : null;
}
