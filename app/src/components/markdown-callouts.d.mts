import type { Blockquote, Paragraph, PhrasingContent } from 'mdast';

export function textOf(nodes: readonly PhrasingContent[]): string;
export function calloutOf(bq: Blockquote): { kind: 'tip' | 'trap'; title: string } | null;
export function calloutBodyChildren(paragraph: Paragraph): PhrasingContent[];
