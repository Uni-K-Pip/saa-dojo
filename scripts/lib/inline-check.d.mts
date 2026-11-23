export function normalizeInlineCheckQuestion(question: string): string;

export function isInlineCheckBlockquote(node: {
  type: string;
  position?: { start: { line: number } };
  children?: readonly { type: string; children?: readonly { type: string }[] }[];
}, line: number): boolean;

export function parseInlineChecks(markdown: string): {
  line: number;
  question: string;
  questionKey: string;
  options: { text: string; correct: boolean }[];
  reason: string;
  problems: string[];
}[];
