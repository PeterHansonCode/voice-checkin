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
