// 検査と Markdown 表示で同じ参照の形を使います（図 #/diagrams/<id>、実物 #/artifacts/<id>）。
const DIAGRAM_LINK = /^#\/diagrams\/(dg-[a-z0-9][a-z0-9-]{1,60})(?:\?step=([0-9]+))?$/;
// 実物には段階がないので、?step などの問い合わせは付けられません（付けると形の違う参照）。
const ARTIFACT_LINK = /^#\/artifacts\/(ar-[a-z0-9][a-z0-9-]{1,60})$/;

/** 参照の先頭（#/diagrams/ か #/artifacts/）から、図か実物かを返します。どちらでもなければ null */
export function materialKindOf(href) {
  if (href.startsWith('#/diagrams/')) return 'diagram';
  if (href.startsWith('#/artifacts/')) return 'artifact';
  return null;
}

export function diagramRefOf(href) {
  const match = DIAGRAM_LINK.exec(href);
  return match ? { id: match[1], step: match[2] === undefined ? undefined : Number(match[2]) } : null;
}

export function artifactRefOf(href) {
  const match = ARTIFACT_LINK.exec(href);
  return match ? { id: match[1] } : null;
}
