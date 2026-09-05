import { DatabaseSync } from 'node:sqlite';
import { ConflictError, validateSubmission } from './domain.ts';

export function createStore(path: string) {
  const db = new DatabaseSync(path, {timeout: 5000});
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;');
  return {
    save(value: unknown) {
      const submission = validateSubmission(value);
      const payload = JSON.stringify({date: submission.date, answers: submission.answers});
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT payload, created_at FROM checkins WHERE id = ?').get(submission.submissionId);
        if (existing) {
          if (existing.payload !== payload) throw new ConflictError('This submission ID already belongs to different answers. Start a new check-in.');
          db.exec('COMMIT');
          return {...submission, createdAt: existing.created_at as string, duplicate: true};
        }
        const createdAt = new Date().toISOString();
        db.prepare('INSERT INTO checkins VALUES (?, ?, ?)').run(submission.submissionId, payload, createdAt);
        db.exec('COMMIT');
        return {...submission, createdAt, duplicate: false};
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    list() {
      return db.prepare('SELECT * FROM checkins ORDER BY created_at DESC LIMIT 50').all().map(row => ({submissionId: row.id, ...JSON.parse(row.payload as string), createdAt: row.created_at}));
    },
    close() { db.close(); }
  };
}
