import type { MockKind } from '../domain/events';

export type CourseItem = { note?: string } & (
  | { kind: 'lesson'; ref: string }
  | { kind: 'doc'; ref: string }
  | { kind: 'lab'; ref: string }
  | { kind: 'pattern'; ref: string }
  | { kind: 'sim'; ref: string }
  | { kind: 'practice' }
  | { kind: 'drill' }
  | { kind: 'analysis' }
  | { kind: 'mock'; mock: MockKind }
);

export interface CourseUnit {
  id: string;
  title: string;
  stage: number;
  items: CourseItem[];
  practiceIds: string[];
}

export interface CourseStage {
  id: number;
  title: string;
  goal: string;
  units: CourseUnit[];
}

export interface Course {
  stages: CourseStage[];
}
