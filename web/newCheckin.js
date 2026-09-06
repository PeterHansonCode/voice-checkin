// Pure sequencing logic for the "New check-in" action, extracted out of the
// real DOM event handler so it can be unit-tested with plain injected
// callbacks -- no jsdom or browser needed, no new dependency added.
//
// The bug this fixes: the original handler disabled only the 'new' button
// while it awaited a fresh /api/status date, never set the shared `busy`
// flag, and silently swallowed a failed fetch (falling through to reset the
// form anyway, with `date` left stale). That meant Save's own `if(busy)
// return;` guard did nothing during that window -- a click on Save while
// the date was mid-refresh could save a check-in under yesterday's date,
// and a network hiccup during the refresh was invisible to the user.
//
// This version: sets `busy` and disables Save too (not just New) for the
// full duration of the fetch, and only resets the form once a fresh date is
// confirmed. If the fetch fails, nothing is reset (the stale date is never
// silently adopted) and the failure is reported through `setStatus`, not
// swallowed.
//
// A second review caught a further bug in that fix: the `finally` block
// unconditionally re-enabled Save and unlocked the fields on ANY outcome,
// success or failure. That's correct after a successful reset, but wrong
// after a failure that happens while a PREVIOUS confirmed submission is
// still frozen (e.g. a save is mid-retry, or the user reopened a draft) --
// unlocking then lets the visible fields be edited while Save would still
// silently submit the old frozen answers underneath them, not what's on
// screen. So the prior lock/Save state is captured before anything
// changes, and a failure restores exactly that state instead of forcing
// everything open.
export async function newCheckin(deps) {
  if (deps.isBusy()) return;
  const wasLocked = deps.isLocked();
  const wasSaveDisabled = deps.isSaveDisabled();
  deps.setBusy(true);
  deps.lock(true);
  deps.setSaveDisabled(true);
  deps.setNewDisabled(true);
  try {
    const info = await deps.fetchStatus();
    deps.setDate(info.date);
    deps.resetState();
    deps.setStatus('A new check-in is ready.');
    deps.lock(false);
    deps.setSaveDisabled(false);
  } catch (e) {
    deps.setStatus(`Could not confirm today's date (${e.message}). Nothing was reset -- try New check-in again before continuing.`);
    deps.lock(wasLocked);
    deps.setSaveDisabled(wasSaveDisabled);
  } finally {
    deps.setBusy(false);
    deps.setNewDisabled(false);
  }
}
