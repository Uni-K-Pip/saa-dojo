import Dexie, { type EntityTable } from 'dexie';
import type { AppEvent } from '../domain/events';
import type { SessionRecord } from '../domain/session';

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface SecretRow {
  key: string;
  value: string;
}

export class SaaDojoDB extends Dexie {
  events!: EntityTable<AppEvent, 'eventId'>;
  meta!: EntityTable<MetaRow, 'key'>;
  secrets!: EntityTable<SecretRow, 'key'>;
  sessions!: EntityTable<SessionRecord, 'id'>;

  constructor(name = 'saa-dojo') {
    super(name);
    this.version(1).stores({
      events: 'eventId, at, type',
      meta: 'key',
      secrets: 'key',
      sessions: 'id, kind, updatedAt',
    });
  }
}

export const db = new SaaDojoDB();
