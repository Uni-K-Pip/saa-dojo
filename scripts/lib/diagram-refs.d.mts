export function materialKindOf(href: string): 'diagram' | 'artifact' | null;
export function diagramRefOf(href: string): { id: string; step?: number } | null;
export function artifactRefOf(href: string): { id: string } | null;
