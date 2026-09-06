# Voice Morning Check-in

A local app that turns spoken or typed answers into editable daily records. Qwen3 extracts candidate values; the user confirms them before SQLite persistence and Markdown export.

**Signature:** retries and lost acknowledgements do not create duplicate records. No paid API or phone number is required.

## Run

Install Node.js 24+ and Ollama, then run from this repository:

```sh
ollama pull qwen3:4b-instruct
npm ci
npm start
```

Open http://127.0.0.1:3100. Ollama must be running on port 11434 for extraction. Manual entry works without it. OLLAMA_MODEL selects another installed compatible model. There is no paid fallback.

## Demo

Speak or type: "I slept seven and a half hours. My energy is four out of five. I got sunlight but did not exercise. I have not meditated."

Organise the answers, correct mistakes, confirm, save and download Markdown.

```text
Browser speech / text -> local extraction -> editable fields -> confirmation
  -> stable submission ID -> SQLite transaction -> Markdown export
```

The retry client holds the confirmed payload fixed until success. Identical IDs and payloads return the existing record; changed payloads conflict. Retries stop after three attempts and skip permanent client errors.

## Verify

```sh
npm run typecheck
npm test
```

Twenty offline tests cover concurrent requests, lost acknowledgement/restart, conflicts, invalid/unconfirmed values, timezone boundaries, bounded retries, per-field extraction sanitisation (one out-of-range or malformed field from the model is nulled and reported, without discarding the other correctly-extracted fields), note-leakage detection (regression cases from real leaked output, plus a word-boundary regex bug that let some recaps slip through, plus cases confirming a genuine short note still passes through), and the "New check-in" date-refresh sequencing (a successful refresh, a failed one, and two clicks racing each other). GitHub Actions is configured; remote execution is not yet verified.

## Local evidence — 6 September 2026

## Code review pass — 6 September 2026

An independent review (ChatGPT, given the working folders) found three more real bugs, all fixed and verified: "New check-in" never refreshed the check-in date, so a tab left open past the local date boundary would keep submitting under the old date -- it now re-fetches the current date first. Speech capture only kept the most recently finalized recognition result, silently discarding any earlier segment if a session ever produced more than one -- it now buffers every result index and joins them in order. The note-leakage regex for "sleep" only ever matched "slep"/"slept", never "sleep" itself (an off-by-letter word-boundary bug), which meant a plain present-tense recap could dodge the filter by one topic-word short of the threshold -- fixed and covered by a new regression test using the exact example the review found. A source comment overclaiming the note filter "never keeps fabricated commentary" was also corrected to state its real, tested limits rather than a guarantee it can't back.

- Twenty tests and TypeScript check passed.
- Eight simultaneous HTTP submissions created one record.
- Browser review/save verified using labelled synthetic data.
- Real Qwen3 extraction tested at roughly 4–7 seconds in observed runs; positive and negative answers mapped correctly after prompt refinement.
- An uncertain sleep answer initially became an invented midpoint. A conservative uncertainty guard leaves that tested case unknown. It is a limited heuristic, not complete ambiguity detection.
- Microphone capture verified on Peter's browser using real speech. Found and fixed a real bug in this pass: some browsers fire the speech API's result event more than once per utterance despite `interimResults: false`, and the transcript was naively appending each call instead of replacing, producing runaway duplicated text. Also found the model occasionally returning an out-of-range value (e.g. energy 12/5) that the server correctly rejected, but doing so discarded every other correctly-extracted field in the same request; extraction now nulls and reports only the specific bad field. A further round of real retesting then showed the note field being filled with the model's own reasoning about rejected values, or a plain recap of every answer, on both an edge-case input and a completely normal one; a strengthened prompt alone did not stop this reliably, so a deterministic check now drops any note that reads like commentary about the extraction (naming a rejected value, or covering most of the tracked topics at once) rather than trusting the model's compliance.

## Code review pass — 6 September 2026 (round two)

A second independent review found the first "New check-in" fix was incomplete: it re-fetched the date, but only disabled the New button while doing so -- Save stayed clickable and the shared `busy` flag was never set, so a click on Save during that window could still race a date refresh, and a failed fetch was silently swallowed (falling through to reset the form with the stale date rather than reporting anything). Fixed by extracting the whole sequence into a plain, dependency-injected function (`web/newCheckin.js`, no DOM references, no new package) that sets `busy` and disables both Save and New for the full duration of the fetch, only resets the form once a fresh date is confirmed, and reports a failed fetch through the status line instead of adopting the stale date silently. Covered by three new regression tests: a successful refresh, a failed one, and two clicks racing each other -- the last of these exercises the original bug directly.

## Scope and privacy

Local prototype; no phone calling, medical advice or public authentication. Browser speech recognition may use the browser vendor's servers. Extraction and stored records are local. Drafts remain in browser localStorage until saved or cleared. Use synthetic data for public demos.

The server binds to loopback and validates Host/Origin and bounded JSON. Local databases and recordings are ignored by Git. Multiple check-ins per day are intentional: idempotency applies per submission ID. Export covers the 50 records visible in recent history. Node 24's built-in SQLite API is experimental. No Vapi, n8n or ElevenLabs integration is claimed.

See [build contract](docs/BUILD-CONTRACT.md).
