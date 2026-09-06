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

Twelve offline tests cover concurrent requests, lost acknowledgement/restart, conflicts, invalid/unconfirmed values, timezone boundaries, bounded retries, and per-field extraction sanitisation (one out-of-range or malformed field from the model is nulled and reported, without discarding the other correctly-extracted fields). GitHub Actions is configured; remote execution is not yet verified.

## Local evidence — 6 September 2026

- Twelve tests and TypeScript check passed.
- Eight simultaneous HTTP submissions created one record.
- Browser review/save verified using labelled synthetic data.
- Real Qwen3 extraction tested at roughly 4–7 seconds in observed runs; positive and negative answers mapped correctly after prompt refinement.
- An uncertain sleep answer initially became an invented midpoint. A conservative uncertainty guard leaves that tested case unknown. It is a limited heuristic, not complete ambiguity detection.
- Microphone capture verified on Peter's browser using real speech. Found and fixed a real bug in this pass: some browsers fire the speech API's result event more than once per utterance despite `interimResults: false`, and the transcript was naively appending each call instead of replacing, producing runaway duplicated text. Also found the model occasionally returning an out-of-range value (e.g. energy 12/5) that the server correctly rejected, but doing so discarded every other correctly-extracted field in the same request; extraction now nulls and reports only the specific bad field.

## Scope and privacy

Local prototype; no phone calling, medical advice or public authentication. Browser speech recognition may use the browser vendor's servers. Extraction and stored records are local. Drafts remain in browser localStorage until saved or cleared. Use synthetic data for public demos.

The server binds to loopback and validates Host/Origin and bounded JSON. Local databases and recordings are ignored by Git. Multiple check-ins per day are intentional: idempotency applies per submission ID. Export covers the 50 records visible in recent history. Node 24's built-in SQLite API is experimental. No Vapi, n8n or ElevenLabs integration is claimed.

See [build contract](docs/BUILD-CONTRACT.md).
