# BaseMark Project State

## Identity
- Product: BaseMark
- Type: local-first field comparison app
- MVP result types: `missing`, `extra`, `position_diff`
- Core stance: human-confirmed inspection, offline-first, lightweight field workflow

## Current Repository State
- Date: 2026-03-18
- Branch: `master`
- Commit state: no commits yet
- App code: minimal Node foundation present
- Docs present:
  - `docs/codex/base_system_prompt.txt`
  - `docs/codex/first_repo_analysis_prompt.txt`
  - `docs/codex/progress_template.md`
- Test setup: Node built-in test runner via `node --test --test-isolation=none`
- Data model implementation: not present
- Build/runtime stack: Node 24 ESM
- Local persistence approach: filesystem-backed JSON documents with schema version guard

## BaseMark Intent Alignment
- Local-first: aligned in docs, not implemented
- Offline-capable core loop: not implemented
- Frozen baseline preservation: not implemented
- `extra` without checkpoint linkage: not implemented
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
- Step: establish the minimal runnable local-first foundation
- Why now: the repository needs a concrete runtime, local persistence direction, and verification command before domain modeling can start
- Out of scope:
  - database schema
  - backup/export logic
  - report generation
  - drawing/map UI
  - full application UI

## Risks / Open Questions
- The current foundation is filesystem-based and does not yet define domain entities.
- No app shell or user-facing workflow exists yet.
- Backup manifest and frozen baseline logic are still undefined above the storage layer.

## Next Smallest Step
- Define the BaseMark V1 core local data model on top of the storage layer:
  - `Project`
  - `Unit`
  - `Space`
  - `Checkpoint`
  - `InspectionRecord`
  - `InspectionItem`
  - `Report`
  - `BackupManifest`
