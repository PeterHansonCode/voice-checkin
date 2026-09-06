import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser JavaScript module is exercised directly.
import {newCheckin} from '../web/newCheckin.js';

function harness(fetchStatus: () => Promise<{date: string}>, initial: {locked?: boolean; saveDisabled?: boolean} = {}) {
  const calls: string[] = [];
  const statusMessages: string[] = [];
  let busy = false;
  let date = '2026-09-05'; // stale, as if the tab was left open overnight
  let resetCalled = false;
  let locked = initial.locked ?? false;
  let saveDisabled = initial.saveDisabled ?? false;
  const deps = {
    isBusy: () => busy,
    setBusy: (value: boolean) => { busy = value; calls.push(`busy:${value}`); },
    isLocked: () => locked,
    isSaveDisabled: () => saveDisabled,
    lock: (value: boolean) => { locked = value; calls.push(`lock:${value}`); },
    setSaveDisabled: (value: boolean) => { saveDisabled = value; calls.push(`save:${value}`); },
    setNewDisabled: (value: boolean) => calls.push(`new:${value}`),
    fetchStatus,
    setDate: (d: string) => { date = d; calls.push(`date:${d}`); },
    resetState: () => { resetCalled = true; calls.push('reset'); },
    setStatus: (message: string) => statusMessages.push(message),
  };
  return {
    deps, calls, statusMessages,
    getDate: () => date, wasReset: () => resetCalled,
    isBusy: () => busy, isLocked: () => locked, isSaveDisabled: () => saveDisabled,
  };
}

test('a successful date refresh locks the form for the whole fetch, then resets with the fresh date',async()=>{
  const h=harness(async()=>({date:'2026-09-06'}));
  await newCheckin(h.deps);
  assert.equal(h.getDate(),'2026-09-06');
  assert.equal(h.wasReset(),true);
  assert.equal(h.isBusy(),false);
  assert.equal(h.isLocked(),false);
  assert.equal(h.isSaveDisabled(),false);
  // lock/save/new must all be disabled before the fetch resolves, then the
  // fresh-form state (lock/save re-enabled) is applied on success before
  // busy/new are released in the finally block.
  assert.deepEqual(h.calls,['busy:true','lock:true','save:true','new:true','date:2026-09-06','reset','lock:false','save:false','busy:false','new:false']);
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
  // Started unlocked with Save enabled, so restoring the prior state after
  // the failure means staying unlocked with Save enabled -- not a change
  // in outcome from this test's starting point, but exercised by the
  // frozen-submission case below where restoring actually matters.
  assert.equal(h.isLocked(),false);
  assert.equal(h.isSaveDisabled(),false);
  assert.match(h.statusMessages.at(-1)!,/[Cc]ould not confirm/);
  assert.match(h.statusMessages.at(-1)!,/network unreachable/);
});

test('a failed date fetch while a previous submission is still frozen restores the lock instead of opening the form',async()=>{
  // A second review caught this: the old code unconditionally unlocked
  // fields and re-enabled Save in a `finally` block regardless of outcome.
  // If the date refresh failed while a prior confirmed submission was
  // still frozen (e.g. a save mid-retry, or a restored draft), that
  // unconditional unlock let the visible fields be edited while Save would
  // still silently submit the OLD frozen answers underneath them -- not
  // what was on screen. Starting from that locked, Save-disabled state, a
  // failed refresh must restore it exactly, not force the form open.
  const h=harness(async()=>{throw new Error('network unreachable');},{locked:true,saveDisabled:true});
  await newCheckin(h.deps);
  assert.equal(h.wasReset(),false,'the frozen submission must not be discarded by a failed refresh');
  assert.equal(h.isBusy(),false);
  assert.equal(h.isLocked(),true,'fields must stay locked -- a failed refresh must not open up editing on top of a stale frozen payload');
  assert.equal(h.isSaveDisabled(),true,'Save must stay disabled, matching the frozen submission it would otherwise silently resubmit');
  assert.match(h.statusMessages.at(-1)!,/[Cc]ould not confirm/);
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
