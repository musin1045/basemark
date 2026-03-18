# BaseMark V1 Flow

## Primary Flow

1. Home
2. Project selection or creation
3. Baseline workspace setup
4. Inspection start
5. Space and checkpoint reference review
6. Result capture
7. Record save
8. Review
9. Finalize

## V1 Screens

### Home

- list local projects
- create a new project
- open backup/restore tools later

### Project Workspace

- view project metadata
- view baseline/comparison units
- view spaces and checkpoints
- start an inspection record

### Baseline Setup

- choose baseline unit
- register spaces
- register checkpoints
- save the baseline catalog for later inspections

### Inspection Start

- choose project
- choose baseline unit
- choose comparison unit
- create a new inspection record with frozen baseline snapshot

### Inspection Capture

- show the current baseline context
- allow result selection: `missing`, `extra`, `position_diff`
- allow note entry
- require checkpoint link for non-`extra`
- allow `extra` items without checkpoint link

### Review

- move `draft` record to `in_review`
- inspect all stored items
- decide whether to reopen or finalize

### Finalized Record

- lock record item mutation
- preserve baseline version and snapshot
- keep the record available for later reporting/export work

## Input Principle

- normal cases should pass quickly
- detailed input opens only for exceptions
- frozen baseline context must remain visible while recording differences
