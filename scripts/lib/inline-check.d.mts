export function normalizeInlineCheckQuestion(question: string): string;

export function parseInlineChecks(markdown: string): {
  line: number;
  question: string;
  questionKey: string;
  options: { text: string; correct: boolean }[];
  reason: string;
  problems: string[];
}[];
