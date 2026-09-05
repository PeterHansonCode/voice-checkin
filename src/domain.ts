export type Answers = {
  sleepHours: number | null;
  energy: number | null;
  sunlight: boolean | null;
  exercise: boolean | null;
  meditation: boolean | null;
  note: string;
};

export class InputError extends Error {}
export class ConflictError extends Error {}

export function parseAnswers(value: unknown): Answers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Answers must be an object.');
  const a = value as Record<string, unknown>;
  const keys = ['sleepHours', 'energy', 'sunlight', 'exercise', 'meditation', 'note'];
  if (Object.keys(a).some(k => !keys.includes(k))) throw new InputError('Unknown answer field.');
  for (const [key, max] of [['sleepHours', 24], ['energy', 5]] as const) {
    const n = a[key];
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < (key === 'energy' ? 1 : 0) || n > max)) {
      throw new InputError(`${key} is outside its allowed range.`);
    }
  }
  if (a.energy !== null && !Number.isInteger(a.energy)) throw new InputError('Energy must be a whole number.');
  for (const key of ['sunlight', 'exercise', 'meditation']) {
    if (a[key] !== null && typeof a[key] !== 'boolean') throw new InputError(`${key} must be yes, no or unknown.`);
  }
  if (typeof a.note !== 'string' || a.note.length > 1000) throw new InputError('Note must be at most 1000 characters.');
  return {
    sleepHours: a.sleepHours as number | null, energy: a.energy as number | null,
    sunlight: a.sunlight as boolean | null, exercise: a.exercise as boolean | null,
    meditation: a.meditation as boolean | null, note: a.note.trim()
  };
}

export function brisbaneDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', {timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function validateSubmission(value: unknown) {
  if (!value || typeof value !== 'object') throw new InputError('Expected a submission.');
  const v = value as Record<string, unknown>;
  if (typeof v.submissionId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(v.submissionId)) throw new InputError('Invalid submission ID.');
  if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0, 10) !== v.date) throw new InputError('Invalid check-in date.');
  if (v.confirmed !== true) throw new InputError('Confirm the answers before saving.');
  return {submissionId: v.submissionId, date: v.date, answers: parseAnswers(v.answers)};
}

export function markdown(date: string, answers: Answers): string {
  const display = (x: unknown) => x === null ? 'Unknown' : x === true ? 'Yes' : x === false ? 'No' : String(x);
  const safeNote = answers.note.replace(/[\\`*_{}\[\]<>#]/g, '\\$&').replace(/\r?\n/g, '\n> ');
  return `# Check-in — ${date}\n\n- Sleep: ${display(answers.sleepHours)} hours\n- Energy: ${display(answers.energy)} / 5\n- Sunlight: ${display(answers.sunlight)}\n- Exercise: ${display(answers.exercise)}\n- Meditation: ${display(answers.meditation)}\n\n## Note\n\n> ${safeNote || 'No note.'}\n`;
}
