# BaseMark Project State

## Identity
- Product: BaseMark
- Type: drawing-grounded field comparison engine with a local-first operating layer
- MVP result types: `missing`, `extra`, `position_diff`
- Core stance: human-confirmed candidate generation, offline-capable operation, lightweight field workflow
- Core pipeline:
  - structural anchor selection
  - normalized coordinate definition
  - local segment alignment
  - `missing` / `extra` / `position_diff` candidate generation
- Operating layer:
  - frozen baseline preservation
  - local persistence
  - status management
  - reporting
  - backup / restore
- Identity note: the current repository mostly implements the operating layer; the comparison engine is not implemented yet.

## Current Repository State
- Date: 2026-03-20
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
- Comparison engine identity: documented, not implemented
- Structural anchor selection: not implemented
- Normalized coordinate pipeline: not implemented
- Local segment alignment: not implemented
- Candidate generation from local scene evidence: not implemented
- Local-first: aligned in docs, partially implemented through the operating layer
- Offline-capable core loop: not implemented
- Frozen baseline preservation: baseline version and snapshot required in inspection records
- `extra` without checkpoint linkage: supported in inspection item contract
- Backup/version integrity: schema version guard started, import/export not implemented
- Backup/version integrity: manual folder-based export/import implemented with manifest and import-as-new restore policy
- Report generation: local Markdown report generation implemented for finalized records
- Drawing/background map workflow: not implemented

## Architecture Guards
- Do not redefine BaseMark as a generic local record app.
- Treat comparison-candidate generation as the product core and local storage/reporting as the operating layer.
- Do not introduce server-first assumptions.
- Do not introduce AI-dependent core inspection logic.
- Do not expand MVP beyond `missing`, `extra`, `position_diff`.
- Do not replace structural relation coordinates with camera-pixel coordinates as the primary reference model.
- Do not require whole-space reconstruction when a local comparison frame is sufficient.
- Keep record lifecycle, item result, and review signaling separate.
- Preserve frozen baseline meaning in future data model work.
- Keep local persistence on stable relative file references.

## Active Bounded Step
- Step: reshape the local shell toward a mobile-first field workflow while starting the first measurement-grade engine slice
- Why now: the current browser shell proves engine and local workflow pieces, but it is still too much of a workbench; the accepted target is now a technician-facing mobile flow with one task per screen, and the most valuable missing engine capability is real-world length conversion
- Out of scope:
  - implementing the full comparison engine in this bounded step
  - cloud sync or distributed locking
  - large framework migration
  - full AR stack
  - automatic final judgment

## Risks / Open Questions
- The interactive shell is currently a thin browser-based operator shell, not a production mobile or desktop app.
- The accepted mobile target is clearer than the current runtime shell, so there is still a gap between target UX and live UI.
- Report generation currently emits Markdown summaries, not PDF output.
- Backup restore uses import-as-new on project conflict; overwrite and merge modes are still intentionally absent.
- Record mutation now uses optimistic compare-and-swap semantics, but there is still no cross-process file lock.
- Long-running soak coverage currently exercises API workflow stability, not true autonomous code improvement.
- Future overlay, measurement, and AR-like features need claim-level patent review and design-around checks before release.

## Next Smallest Step
- Move the current shell toward the accepted mobile target in bounded slices:
  - add a mobile home screen with project status, quick actions, and item list
  - separate add-item flow into a sequential form screen
  - isolate review as its own screen
  - keep advanced editor/debug surfaces hidden behind a secondary mode
- In parallel, prepare the next engine-centered slice:
  - keep known-length input and ratio-to-mm conversion in the core engine
  - surface candidate output with real-world offset display in the UI
  - then move to drawing parsing and anchor auto-suggestion as the next bounded vision slice
