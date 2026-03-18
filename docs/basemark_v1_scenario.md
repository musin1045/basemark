# BaseMark V1 Scenario

## Scenario: Inspect One Comparison Unit

### Setup

- create project `project-1`
- register baseline unit `unit-baseline`
- register comparison unit `unit-comparison`
- register one space `space-1`
- register one checkpoint `cp-1`

### Action

1. Initialize the workspace.
2. Start inspection record `record-1` with `baselineVersion = baseline-v1`.
3. Add item `item-1` as `missing` for checkpoint `cp-1`.
4. Move the record to `in_review`.
5. Finalize the record.

### Expected Result

- the record keeps `status = finalized`
- the record keeps `baselineVersion = baseline-v1`
- the record keeps the frozen baseline snapshot created at start time
- the record stores one item with `resultType = missing`
- the local files remain readable from the `projects/` and `records/` folders

## Matching CLI Commands

```bash
npm run cli -- workspace:init --data-dir ./data --input ./workspace.json
npm run cli -- record:start --data-dir ./data --input ./record.json
npm run cli -- record:add-item --data-dir ./data --input ./item.json
npm run cli -- record:send-review --data-dir ./data --record-id record-1
npm run cli -- record:finalize --data-dir ./data --record-id record-1
```
