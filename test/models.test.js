import test from "node:test";
import assert from "node:assert/strict";

import {
  BASEMARK_RECORD_STATUSES,
  BASEMARK_RESULT_TYPES,
  createBackupManifest,
  createBaseMarkModel,
  createInspectionItem,
  createInspectionRecord
} from "../src/domain/models.js";

test("BaseMark model exposes frozen MVP statuses and result types", () => {
  assert.deepEqual(BASEMARK_RESULT_TYPES, [
    "missing",
    "extra",
    "position_diff",
    "ok"
  ]);
  assert.deepEqual(BASEMARK_RECORD_STATUSES, [
    "draft",
    "in_review",
    "finalized"
  ]);
});

test("InspectionRecord requires a frozen baseline version and snapshot", () => {
  const record = createInspectionRecord({
    id: "record-1",
    projectId: "project-1",
    baselineUnitId: "unit-baseline",
    comparisonUnitId: "unit-comparison",
    status: "draft",
    baselineVersion: "baseline-v1",
    baselineSnapshot: {
      unitId: "unit-baseline",
      checkpoints: [{ id: "cp-1", label: "Door frame" }]
    },
    items: [
      {
        id: "item-1",
        checkpointId: "cp-1",
        resultType: "missing",
        reviewRequired: true
      }
    ]
  });

  assert.equal(record.baselineVersion, "baseline-v1");
  assert.equal(record.items[0].recordId, "record-1");
  assert.equal(record.reviewRequired, true);
});

test("Extra items remain independent from baseline checkpoints", () => {
  const item = createInspectionItem({
    id: "item-extra-1",
    recordId: "record-1",
    resultType: "extra",
    reviewRequired: false,
    spaceId: "space-1",
    note: "Unexpected outlet"
  });

  assert.equal(item.checkpointId, null);
  assert.equal(item.resultType, "extra");
});

test("Non-extra items require checkpoint linkage", async () => {
  await assert.rejects(
    async () =>
      createInspectionItem({
        id: "item-2",
        recordId: "record-1",
        resultType: "missing",
        reviewRequired: false
      }),
    /checkpointId is required/
  );
});

test("Backup manifest keeps stable relative file references", () => {
  const manifest = createBackupManifest({
    id: "backup-1",
    createdAt: "2026-03-18T00:00:00.000Z",
    schemaVersion: "1",
    files: [
      {
        path: "records/record-1.json",
        sha256: "abc123"
      }
    ]
  });

  assert.equal(manifest.files[0].path, "records/record-1.json");
});

test("Full BaseMark model assembles the minimal V1 entities", () => {
  const model = createBaseMarkModel({
    project: {
      id: "project-1",
      name: "Tower A"
    },
    units: [
      { id: "unit-baseline", projectId: "project-1", name: "101", kind: "baseline" },
      { id: "unit-comparison", projectId: "project-1", name: "102", kind: "comparison" }
    ],
    spaces: [
      { id: "space-1", unitId: "unit-baseline", name: "Living Room" }
    ],
    checkpoints: [
      {
        id: "cp-1",
        unitId: "unit-baseline",
        spaceId: "space-1",
        label: "Window A"
      }
    ],
    inspectionRecords: [
      {
        id: "record-1",
        projectId: "project-1",
        baselineUnitId: "unit-baseline",
        comparisonUnitId: "unit-comparison",
        status: "draft",
        baselineVersion: "baseline-v1",
        baselineSnapshot: {
          unitId: "unit-baseline",
          checkpoints: [{ id: "cp-1", label: "Window A" }]
        },
        items: [
          {
            id: "item-1",
            checkpointId: "cp-1",
            resultType: "position_diff",
            reviewRequired: true
          },
          {
            id: "item-2",
            resultType: "extra",
            reviewRequired: false,
            note: "Unexpected switch"
          }
        ]
      }
    ],
    reports: [
      {
        id: "report-1",
        recordId: "record-1",
        fileName: "record-1.pdf"
      }
    ],
    backupManifest: {
      id: "backup-1",
      createdAt: "2026-03-18T00:00:00.000Z",
      schemaVersion: "1",
      files: [
        {
          path: "records/record-1.json",
          sha256: "abc123"
        }
      ]
    }
  });

  assert.equal(model.project.name, "Tower A");
  assert.equal(model.inspectionRecords[0].items[1].checkpointId, null);
  assert.equal(model.backupManifest.files[0].path, "records/record-1.json");
});
