export function parseInlineChecks(markdown: string): {
  line: number;
  question: string;
  options: { text: string; correct: boolean }[];
  reason: string;
  problems: string[];
}[];
