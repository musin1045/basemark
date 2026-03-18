# BaseMark Project State

## Identity
- Product: BaseMark
- Type: local-first field comparison app
- MVP result types: `missing`, `extra`, `position_diff`
- Core stance: human-confirmed inspection, offline-first, lightweight field workflow

## Current Repository State
- Date: 2026-03-18
- Branch: `master`
- Commit state: initial local-first foundation committed
- App code: minimal Node foundation present
- Docs present:
  - `docs/codex/base_system_prompt.txt`
  - `docs/codex/first_repo_analysis_prompt.txt`
  - `docs/codex/progress_template.md`
- Test setup: Node built-in test runner via `node --test --test-isolation=none`
- Data model implementation: minimal V1 entity contracts present
- Build/runtime stack: Node 24 ESM
- Local persistence approach: filesystem-backed JSON documents with schema version guard

## BaseMark Intent Alignment
- Local-first: aligned in docs, not implemented
- Offline-capable core loop: not implemented
- Frozen baseline preservation: baseline version and snapshot required in inspection records
- `extra` without checkpoint linkage: supported in inspection item contract
- Backup/version integrity: schema version guard started, import/export not implemented
- Report generation: not implemented
- Drawing/background map workflow: not implemented

## Architecture Guards
- Do not introduce server-first assumptions.
- Do not introduce AI-dependent core inspection logic.
- Do not expand MVP beyond `missing`, `extra`, `position_diff`.
- Keep record lifecycle, item result, and review signaling separate.
- Preserve frozen baseline meaning in future data model work.
- Keep local persistence on stable relative file references.

## Active Bounded Step
- Step: define the BaseMark V1 core local data model
- Why now: the storage layer exists, so the next safe step is to freeze core entity meaning before adding app workflow or persistence adapters
- Out of scope:
  - database migrations
  - backup/export logic
  - report generation
  - drawing/map UI
  - full application UI

## Risks / Open Questions
- No app shell or user-facing workflow exists yet.
- Backup manifest exists only as a contract, not as an export/import implementation.
- Inspection entities are validated in memory, but not yet persisted as BaseMark-specific documents.

## Next Smallest Step
- Add BaseMark document repositories on top of the local store:
  - project document read/write
  - inspection record read/write
  - backup manifest read/write
  - tests for stable relative file layout
