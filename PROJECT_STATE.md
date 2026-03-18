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
- Local app entrypoints:
  - JSON-input CLI for workspace and inspection record operations
  - dependency-free local web shell over HTTP for interactive V1 flow

## BaseMark Intent Alignment
- Local-first: aligned in docs, not implemented
- Offline-capable core loop: not implemented
- Frozen baseline preservation: baseline version and snapshot required in inspection records
- `extra` without checkpoint linkage: supported in inspection item contract
- Backup/version integrity: schema version guard started, import/export not implemented
- Backup/version integrity: manual folder-based export/import implemented with manifest and import-as-new restore policy
- Report generation: local Markdown report generation implemented for finalized records
- Drawing/background map workflow: not implemented

## Architecture Guards
- Do not introduce server-first assumptions.
- Do not introduce AI-dependent core inspection logic.
- Do not expand MVP beyond `missing`, `extra`, `position_diff`.
- Keep record lifecycle, item result, and review signaling separate.
- Preserve frozen baseline meaning in future data model work.
- Keep local persistence on stable relative file references.

## Active Bounded Step
- Step: deepen the V1 report and operator shell flow
- Why now: backup and local report generation now exist, so the next safe step is to make the report slice more usable and visible in the local shell
- Out of scope:
  - database migrations
  - drawing/map UI
  - full application UI

## Risks / Open Questions
- The interactive shell is currently a thin browser-based operator shell, not a production mobile or desktop app.
- Report generation currently emits Markdown summaries, not PDF output.
- Backup restore uses import-as-new on project conflict; overwrite and merge modes are still intentionally absent.

## Next Smallest Step
- Deepen the report slice:
  - add report list and detail visibility in the web shell
  - improve report content formatting and summary structure
  - decide whether V1 stops at Markdown or adds a PDF conversion step
  - include generated reports consistently in backup/restore verification
