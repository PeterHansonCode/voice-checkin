import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser JavaScript module is exercised directly.
import {newCheckin} from '../web/newCheckin.js';

function harness(fetchStatus: () => Promise<{date: string}>) {
  const calls: string[] = [];
  const statusMessages: string[] = [];
  let busy = false;
  let date = '2026-09-05'; // stale, as if the tab was left open overnight
  let resetCalled = false;
  const deps = {
    isBusy: () => busy,
    setBusy: (value: boolean) => { busy = value; calls.push(`busy:${value}`); },
    lock: (value: boolean) => calls.push(`lock:${value}`),
    setSaveDisabled: (value: boolean) => calls.push(`save:${value}`),
    setNewDisabled: (value: boolean) => calls.push(`new:${value}`),
    fetchStatus,
    setDate: (d: string) => { date = d; calls.push(`date:${d}`); },
    resetState: () => { resetCalled = true; calls.push('reset'); },
    setStatus: (message: string) => statusMessages.push(message),
  };
  return {deps, calls, statusMessages, getDate: () => date, wasReset: () => resetCalled, isBusy: () => busy};
}

test('a successful date refresh locks the form for the whole fetch, then resets with the fresh date',async()=>{
  const h=harness(async()=>({date:'2026-09-06'}));
  await newCheckin(h.deps);
  assert.equal(h.getDate(),'2026-09-06');
  assert.equal(h.wasReset(),true);
  assert.equal(h.isBusy(),false);
  // lock/save/new must all be disabled before the fetch resolves and
  // re-enabled only in the finally block, in that order.
  assert.deepEqual(h.calls,['busy:true','lock:true','save:true','new:true','date:2026-09-06','reset','busy:false','lock:false','new:false','save:false']);
  assert.match(h.statusMessages.at(-1)!,/ready/);
});

test('a failed date fetch never resets the form and reports the failure instead of going silent',async()=>{
  const h=harness(async()=>{throw new Error('network unreachable');});
  await newCheckin(h.deps);
  // The old, stale date must survive untouched -- adopting it silently is
  // exactly the bug this closes.
  assert.equal(h.getDate(),'2026-09-05');
  assert.equal(h.wasReset(),false);
  assert.equal(h.isBusy(),false,'the form must not be left permanently locked after a failure');
  assert.match(h.statusMessages.at(-1)!,/[Cc]ould not confirm/);
  assert.match(h.statusMessages.at(-1)!,/network unreachable/);
  // Still must have locked (and then unlocked) Save around the failed
  // attempt, not just New.
  assert.ok(h.calls.includes('save:true'));
  assert.ok(h.calls.includes('save:false'));
});

test('a second New click while the first is still in flight is a no-op, closing the original race',async()=>{
  let resolveFirst: (v: {date: string}) => void;
  const first = new Promise<{date: string}>(resolve => { resolveFirst = resolve; });
  const h = harness(() => first);
  const firstCall = newCheckin(h.deps);
  assert.equal(h.isBusy(), true, 'busy must already be set before the first fetch resolves');
  const callsBeforeSecond = h.calls.length;
  await newCheckin(h.deps); // fires while firstCall is still pending
  assert.equal(h.calls.length, callsBeforeSecond, 'a concurrent call must not touch any shared state at all');
  resolveFirst!({date: '2026-09-06'});
  await firstCall;
  assert.equal(h.getDate(), '2026-09-06');
});
