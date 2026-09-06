import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeExtractedAnswers} from '../src/domain.ts';

const good = {sleepHours: 7.5, energy: 4, sunlight: true, exercise: false, meditation: null, note: ''};

test('one out-of-range field is nulled without discarding the other correctly-extracted fields', () => {
  const {answers, dropped} = sanitizeExtractedAnswers({...good, energy: 12});
  assert.equal(answers.energy, null);
  assert.deepEqual(dropped, ['energy']);
  assert.equal(answers.sleepHours, 7.5);
  assert.equal(answers.sunlight, true);
  assert.equal(answers.exercise, false);
});

test('an out-of-range sleepHours is nulled the same way, independent of other fields', () => {
  const {answers, dropped} = sanitizeExtractedAnswers({...good, sleepHours: 30});
  assert.equal(answers.sleepHours, null);
  assert.deepEqual(dropped, ['sleepHours']);
  assert.equal(answers.energy, 4);
});

test('multiple bad fields are each nulled and each reported', () => {
  const {answers, dropped} = sanitizeExtractedAnswers({...good, energy: 12, sunlight: 'yes'});
  assert.equal(answers.energy, null);
  assert.equal(answers.sunlight, null);
  assert.deepEqual(dropped.sort(), ['energy', 'sunlight']);
});

test('a note that is too long or the wrong type is dropped, not silently truncated into something invented', () => {
  const {answers, dropped} = sanitizeExtractedAnswers({...good, note: 'x'.repeat(1001)});
  assert.equal(answers.note, '');
  assert.deepEqual(dropped, ['note']);
});

test('null and well-formed values pass through untouched with nothing reported as dropped', () => {
  const {answers, dropped} = sanitizeExtractedAnswers(good);
  assert.deepEqual(answers, good);
  assert.deepEqual(dropped, []);
});

test('non-object model output is rejected outright, not silently coerced', () => {
  assert.throws(() => sanitizeExtractedAnswers('not an object'), /object/);
});

// Regression cases: these are the two real strings a real user's model
// output actually produced, captured verbatim from live testing, after a
// prompt-only fix had already failed to stop them.
test('a rambling reasoning dump about rejected fields is dropped, not kept as a note', () => {
  const leaked = "Energy value of 7 out of 10 is invalid as energy should be a 1–5 score. Exercise duration of 10 microseconds and meditation of 10 billion years are physically impossible or nonsensical. Sleep duration of 5 hours is valid but does not affect energy score as per constraints. All values are either invalid or impossible, thus null or false for energy and activities as per rules.";
  const {answers, dropped} = sanitizeExtractedAnswers({...good, note: leaked});
  assert.equal(answers.note, '');
  assert.deepEqual(dropped, ['note']);
});

test('a plain recap of every answered field is dropped even with nothing invalid to explain', () => {
  const leaked = 'Slept 7 hours, 3 minutes of sunlight, energy 4.5 (rounded to 4), exercised 10 minutes, no meditation yet.';
  const {answers, dropped} = sanitizeExtractedAnswers({...good, note: leaked});
  assert.equal(answers.note, '');
  assert.deepEqual(dropped, ['note']);
});

test('a genuine short personal remark is kept, not falsely flagged as a leaked summary', () => {
  const {answers, dropped} = sanitizeExtractedAnswers({...good, note: 'Note that I have a dentist appointment tomorrow.'});
  assert.equal(answers.note, 'Note that I have a dentist appointment tomorrow.');
  assert.deepEqual(dropped, []);
});

test('a genuine note mentioning one tracked topic in passing is still kept', () => {
  const {answers, dropped} = sanitizeExtractedAnswers({...good, note: 'Slept in a hotel room with bad blackout curtains.'});
  assert.equal(answers.note, 'Slept in a hotel room with bad blackout curtains.');
  assert.deepEqual(dropped, []);
});

test('a present-tense recap using the word "sleep" is still caught, not missed by a word-boundary bug', () => {
  // Regression case: the topic-word regex for sleep was /\bslept?\b/, which
  // can only match "slep" or "slept" -- never "sleep" itself. That silently
  // undercounted topic words for any recap phrased in the present tense.
  const {answers, dropped} = sanitizeExtractedAnswers({...good, note: 'Sleep 7 hours, sunlight yes, exercise no.'});
  assert.equal(answers.note, '');
  assert.deepEqual(dropped, ['note']);
});
