# Build contract (proposal)

## One signature

Reliable capture: users can correct recognition mistakes, confirm the record, and retry submission without duplicate entries.

## Vertical slice

Start session -> hear a question -> speak/type -> extract candidate values -> validate -> correct/confirm -> save -> export Markdown.

First fields: sleep hours (0–24), energy (integer 1–5), three habit flags (boolean or unknown), optional short note. Add six-pillar labels after the basic flow works. Never infer missing health values. These are personal logs, not medical recommendations.

## Boundaries

- Capture adapter returns transcript plus mode; failed recognition preserves prior answers and offers typing.
- Extraction adapter returns candidate fields and missing/ambiguous fields. The live AI mode must use real inference; fixture mode must be visibly labelled.
- Confirmation is required before persistence. Editing after confirmation requires fresh confirmation.
- POST /checkins accepts a validated payload and stable submission ID. Same ID/same payload returns original record; same ID/different payload returns conflict. Enforce uniqueness in storage, including concurrent requests.
- Retry network/transient errors at most three attempts; never retry invalid data or conflicts automatically.
- Local date uses Australia/Brisbane, independently of browser UTC date.
- Persist records before export; exports are derived artifacts so export failure cannot lose the saved record.
- Local-only binding by default. Any external webhook requires authentication, payload limits and verified integration testing.

## Tests that earn the resume bullet

1. Repeated and concurrent identical submissions create one record.
2. Same submission ID with changed data returns conflict.
3. Simulated failure after successful persistence can be retried without duplication.
4. Invalid values never reach storage; ambiguous responses trigger confirmation/correction.
5. Restart retains saved records; Markdown export reflects stored data.
6. Browser microphone path works on Peter's computer; typed fallback is separately tested.

## Explicit cuts

No outbound phone/SMS, autonomous vault editing, cloud hosting, elaborate monitoring, or multiple model providers in the initial build. An n8n workflow is optional until it is imported and executed; a JSON file alone does not justify a resume claim.

## Evidence to record

Test command/results, one successful spoken check-in, one corrected value, one duplicated submission, Markdown output, setup duration, and precise implemented stack. Do not claim call-level cost or telephone reliability for a browser workflow.
