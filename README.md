# Voice Morning Check-in

Planning skeleton — implementation has not started.

A proposed browser voice check-in that confirms daily answers before saving a structured record and exporting Markdown. Signature strength: reliable capture and duplicate-safe persistence.

See [the build contract](docs/BUILD-CONTRACT.md). Proposed stack: TypeScript, Node.js, SQLite, browser speech. LLM/provider and n8n integration remain undecided. No phone calling or completed AI capability is claimed.

## Planned layout

```text
src/domain/       schemas and check-in state machine
src/adapters/     speech/model and persistence boundaries
src/server/       HTTP endpoints
web/              voice, correction and confirmation interface
tests/            duplicate, interruption and retry scenarios
docs/             build contract and eventual demo evidence
```

Setup, test commands, screenshots and measured results will be added when implemented.
