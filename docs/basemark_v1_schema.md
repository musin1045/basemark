# BaseMark V1 Local Schema

## Storage Layout

- `projects/{projectId}.json`
- `projects/{projectId}.catalog.json`
- `records/{recordId}.json`
- `backups/{backupId}.json`
- `reports/{reportId}.json`
- `report-files/{reportId}.md`

All documents are stored through schema-versioned JSON envelopes.

## Project

- `id`
- `name`
- `siteName`
- `notes`

## Project Catalog

- `projectId`
- `units[]`
- `spaces[]`
- `checkpoints[]`

## Unit

- `id`
- `projectId`
- `name`
- `kind`
  allowed: `baseline`, `comparison`

## Space

- `id`
- `unitId`
- `name`
- `label`

## Checkpoint

- `id`
- `unitId`
- `spaceId`
- `label`
- `mapPin`

## Inspection Record

- `id`
- `projectId`
- `baselineUnitId`
- `comparisonUnitId`
- `status`
  allowed: `draft`, `in_review`, `finalized`
- `baselineVersion`
- `baselineSnapshot`
- `reviewRequired`
- `items[]`

### Baseline Snapshot

Inspection records must preserve the baseline meaning from inspection start time.

- `unitId`
- `unitName`
- `spaces[]`
- `checkpoints[]`

Changes to the baseline catalog after record creation do not retroactively change the inspection record.

## Inspection Item

- `id`
- `recordId`
- `checkpointId`
  nullable for `extra`
- `spaceId`
- `resultType`
  allowed: `missing`, `extra`, `position_diff`, `ok`
- `reviewRequired`
- `note`

### Item Rules

- non-`extra` items require a checkpoint from the frozen baseline snapshot
- `extra` items must not require checkpoint linkage
- `resultType` stores the inspection judgment only
- `reviewRequired` stores follow-up need only

## Report

- `id`
- `recordId`
- `fileName`
- `generatedAt`

V1 generates a local Markdown summary artifact and stores report metadata separately.

## Backup Manifest

- `id`
- `createdAt`
- `schemaVersion`
- `files[]`

### Backup Rules

- file entries use relative paths
- schema version is mandatory
- restore conflict handling remains a later implementation step
