# BaseMark V1 Scope

## Product Cutline

BaseMark V1 is a local-first field comparison app focused on the smallest usable loop:

`baseline setup -> inspection -> save -> review/finalize -> local export foundation`

The V1 app must work without a server and without AI assistance.

## In Scope

- project workspace creation
- baseline/comparison unit catalog registration
- space registration
- checkpoint registration
- inspection record start from frozen baseline data
- inspection result types: `missing`, `extra`, `position_diff`
- item notes
- local JSON document persistence
- explicit review/finalize workflow
- manual backup manifest contract
- local CLI operation for workspace and record actions

## Out Of Scope

- AI candidate detection
- camera-based automatic measurement
- cloud sync
- team collaboration
- drawing or CAD integration
- plumbing route capture
- chat or notification systems
- automatic report generation UI

## V1 Rules

- past inspection records must keep the baseline meaning from when the inspection started
- baseline and comparison unit roles must be validated before record creation
- `extra` items must be allowed without a baseline checkpoint link
- record status, item result, and review flag must stay separate concerns
- local file layout must remain stable and relative-path based

## Initial Success Criteria

- an operator can create a project workspace locally
- an operator can start an inspection record from stored baseline data
- an operator can append inspection items and move the record to review/finalized
- all data remains readable from local JSON documents
- the workflow runs through the CLI without needing external services

## UX Targets

These are operating targets, not validated field measurements yet.

- baseline setup target: 15 to 30 minutes
- typical unit inspection target: 1 to 2 minutes
- exception-heavy unit inspection target: under 3 minutes
- normal-path interaction target: 15 to 30 touches
