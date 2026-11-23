export const CALLOUT_KINDS: Readonly<Record<string, 'tip' | 'trap'>>;

export function normalizeInlineCheckQuestion(question: string): string;
export function inlineCheckId(questionKey: string): string;

export function isInlineCheckBlockquote(node: {
  type: string;
  position?: { start: { line: number }; end: { line: number } };
  children?: readonly { type: string; children?: readonly { type: string }[] }[];
}, check: { line: number; endLine: number }): boolean;

export function parseInlineChecks(markdown: string): {
  line: number;
  endLine: number;
  questionLine: number;
  question: string;
  questionKey: string;
  options: { text: string; correct: boolean }[];
  reason: string;
  reasonLines: number[];
  problems: string[];
  followingCallout?: { line: number; message: string };
}[];

export function suspectMarkdownFences(markdown: string): { line: number; checkLine: number }[];
