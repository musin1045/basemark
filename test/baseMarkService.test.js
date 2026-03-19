import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BaseMarkService } from "../src/app/baseMarkService.js";
import { BaseMarkRepository } from "../src/storage/basemarkRepository.js";
import { LocalStore } from "../src/storage/localStore.js";

function createService(tempRoot) {
  return new BaseMarkService({
    repository: new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    }),
    exportDir: path.join(tempRoot, "..", `${path.basename(tempRoot)}-exports`)
  });
}

async function seedWorkspace(service) {
  await service.createProjectWorkspace({
    project: {
      id: "project-1",
      name: "Tower A"
    },
    units: [
      {
        id: "unit-baseline",
        projectId: "project-1",
        name: "101",
        kind: "baseline"
      },
      {
        id: "unit-comparison",
        projectId: "project-1",
        name: "102",
        kind: "comparison"
      },
      {
        id: "unit-other-baseline",
        projectId: "project-1",
        name: "103",
        kind: "baseline"
      }
    ],
    spaces: [
      {
        id: "space-1",
        unitId: "unit-baseline",
        name: "Living Room"
      },
      {
        id: "space-2",
        unitId: "unit-other-baseline",
        name: "Bedroom"
      }
    ],
    checkpoints: [
      {
        id: "cp-1",
        unitId: "unit-baseline",
        spaceId: "space-1",
        label: "Window A"
      },
      {
        id: "cp-2",
        unitId: "unit-other-baseline",
        spaceId: "space-2",
        label: "Closet"
      }
    ]
  });
}

test("BaseMarkService creates and loads the minimal project workspace", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);

    const workspace = await service.createProjectWorkspace({
      project: {
        id: "project-1",
        name: "Tower A",
        siteName: "Seoul"
      },
      units: [
        {
          id: "unit-baseline",
          projectId: "project-1",
          name: "101",
          kind: "baseline"
        }
      ],
      spaces: [
        {
          id: "space-1",
          unitId: "unit-baseline",
          name: "Living Room"
        }
      ],
      checkpoints: [
        {
          id: "cp-1",
          unitId: "unit-baseline",
          spaceId: "space-1",
          label: "Window A"
        }
      ]
    });

    const loaded = await service.loadProjectWorkspace("project-1");

    assert.equal(workspace.project.id, "project-1");
    assert.equal(workspace.catalog.units.length, 1);
    assert.equal(loaded.project.name, "Tower A");
    assert.equal(loaded.project.siteName, "Seoul");
    assert.equal(loaded.catalog.checkpoints[0].label, "Window A");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService starts an inspection record with a catalog-derived frozen baseline snapshot", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);

    const record = await service.startInspectionRecord({
      id: "record-1",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const reloaded = await service.appendInspectionItem({
      recordId: "record-1",
      item: {
        id: "item-1",
        checkpointId: "cp-1",
        resultType: "missing",
        reviewRequired: true
      }
    });

    assert.equal(record.status, "draft");
    assert.equal(record.baselineSnapshot.unitName, "101");
    assert.equal(record.baselineSnapshot.spaces[0].name, "Living Room");
    assert.equal(reloaded.baselineSnapshot.checkpoints[0].label, "Window A");
    assert.equal(reloaded.baselineVersion, "baseline-v1");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService appends inspection items and recalculates review state", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);

    await service.startInspectionRecord({
      id: "record-2",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const afterFirstItem = await service.appendInspectionItem({
      recordId: "record-2",
      item: {
        id: "item-1",
        checkpointId: "cp-1",
        resultType: "position_diff",
        reviewRequired: false
      }
    });

    const afterSecondItem = await service.appendInspectionItem({
      recordId: "record-2",
      item: {
        id: "item-2",
        resultType: "extra",
        reviewRequired: true,
        note: "Unexpected outlet"
      }
    });

    assert.equal(afterFirstItem.reviewRequired, false);
    assert.equal(afterSecondItem.items.length, 2);
    assert.equal(afterSecondItem.items[1].recordId, "record-2");
    assert.equal(afterSecondItem.reviewRequired, true);
    assert.equal(afterSecondItem.baselineSnapshot.checkpoints.length, 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService rejects invalid baseline and comparison unit roles", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);

    await assert.rejects(
      () =>
        service.startInspectionRecord({
          id: "record-invalid-1",
          projectId: "project-1",
          baselineUnitId: "unit-comparison",
          comparisonUnitId: "unit-baseline",
          baselineVersion: "baseline-v1"
        }),
      /baseline unit/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService rejects inspection items outside the frozen baseline snapshot", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);

    await service.startInspectionRecord({
      id: "record-3",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    await assert.rejects(
      () =>
        service.appendInspectionItem({
          recordId: "record-3",
          item: {
            id: "item-1",
            checkpointId: "cp-2",
            resultType: "missing",
            reviewRequired: true
          }
        }),
      /outside the frozen baseline snapshot/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService enforces explicit review and finalization transitions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);

    await service.startInspectionRecord({
      id: "record-4",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const inReview = await service.sendInspectionRecordToReview("record-4");
    const reopened = await service.reopenInspectionRecord("record-4");
    await service.sendInspectionRecordToReview("record-4");
    const finalized = await service.finalizeInspectionRecord("record-4");

    assert.equal(inReview.status, "in_review");
    assert.equal(reopened.status, "draft");
    assert.equal(finalized.status, "finalized");

    await assert.rejects(
      () => service.finalizeInspectionRecord("record-4"),
      /Invalid inspection record status transition/
    );

    await assert.rejects(
      () =>
        service.appendInspectionItem({
          recordId: "record-4",
          item: {
            id: "item-closed",
            checkpointId: "cp-1",
            resultType: "missing",
            reviewRequired: false
          }
        }),
      /cannot be modified while finalized/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService exports a project backup package and stores a manifest", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));
  const exportRoot = path.join(tempRoot, "..", `${path.basename(tempRoot)}-exports`);

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);
    await service.startInspectionRecord({
      id: "record-5",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const backup = await service.exportProjectBackup("project-1");
    const listedBackups = await service.listBackupPackages();
    const storedManifests = await service.listBackupManifests();

    assert.match(backup.backupId, /^backup-project-1-/);
    assert.equal(backup.manifest.projectIds[0], "project-1");
    assert.equal(backup.manifest.exportMode, "manual_folder");
    assert.equal(listedBackups.length, 1);
    assert.equal(storedManifests.length, 1);
    assert.equal(storedManifests[0].id, backup.backupId);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService restores a backup package with import-as-new on project conflict", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-src-"));
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-dst-"));
  const exportRoot = path.join(os.tmpdir(), `basemark-shared-export-${Date.now()}`);

  try {
    const sourceService = new BaseMarkService({
      repository: new BaseMarkRepository({
        store: new LocalStore({ rootDir: sourceRoot })
      }),
      exportDir: exportRoot
    });
    const targetService = new BaseMarkService({
      repository: new BaseMarkRepository({
        store: new LocalStore({ rootDir: targetRoot })
      }),
      exportDir: exportRoot
    });

    await seedWorkspace(sourceService);
    await sourceService.startInspectionRecord({
      id: "record-6",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });
    const backup = await sourceService.exportProjectBackup("project-1");

    await seedWorkspace(targetService);

    const restored = await targetService.restoreBackupPackage(backup.backupId);
    const projects = await targetService.listProjects();
    const records = await targetService.listInspectionRecords();

    assert.equal(restored.restoredProjects.length, 1);
    assert.equal(restored.restoredProjects[0].imported, true);
    assert.equal(projects.length, 2);
    assert.equal(records.length, 1);
    assert.match(restored.restoredProjects[0].projectId, /^project-1-import-/);
    assert.match(restored.restoredRecords[0].recordId, /^record-6-import-/);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService generates a markdown report from a finalized inspection record", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));
  const exportRoot = path.join(tempRoot, "..", `${path.basename(tempRoot)}-exports`);

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);
    await service.startInspectionRecord({
      id: "record-7",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });
    await service.appendInspectionItem({
      recordId: "record-7",
      item: {
        id: "item-1",
        checkpointId: "cp-1",
        resultType: "missing",
        reviewRequired: true,
        note: "Window outlet missing"
      }
    });
    await service.sendInspectionRecordToReview("record-7");
    await service.finalizeInspectionRecord("record-7");

    const generated = await service.generateInspectionReport("record-7");
    const reports = await service.listReports("project-1");
    const raw = await readFile(path.join(tempRoot, generated.report.fileName), "utf8");

    assert.equal(generated.report.recordId, "record-7");
    assert.equal(reports.length, 1);
    assert.match(raw, /BaseMark Inspection Report/);
    assert.match(raw, /Window outlet missing/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService cleans up temp backup output when export fails", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));
  const exportRoot = path.join(tempRoot, "..", `${path.basename(tempRoot)}-exports`);

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);
    await service.startInspectionRecord({
      id: "record-8",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });
    await service.sendInspectionRecordToReview("record-8");
    await service.finalizeInspectionRecord("record-8");
    const generated = await service.generateInspectionReport("record-8");
    await unlink(path.join(tempRoot, generated.report.fileName));

    await assert.rejects(
      () => service.exportProjectBackup("project-1"),
      /ENOENT/
    );

    const exportEntries = await service.listBackupPackages();
    assert.equal(exportEntries.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService rejects restore when backup file checksum does not match", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-src-"));
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-dst-"));
  const exportRoot = path.join(os.tmpdir(), `basemark-shared-export-${Date.now()}-checksum`);

  try {
    const sourceService = new BaseMarkService({
      repository: new BaseMarkRepository({
        store: new LocalStore({ rootDir: sourceRoot })
      }),
      exportDir: exportRoot
    });
    const targetService = new BaseMarkService({
      repository: new BaseMarkRepository({
        store: new LocalStore({ rootDir: targetRoot })
      }),
      exportDir: exportRoot
    });

    await seedWorkspace(sourceService);
    const backup = await sourceService.exportProjectBackup("project-1");
    await writeFile(
      path.join(exportRoot, backup.backupId, "projects", "project-1.json"),
      '{"tampered":true}',
      "utf8"
    );

    await assert.rejects(
      () => targetService.restoreBackupPackage(backup.backupId),
      /checksum mismatch/
    );
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("BaseMarkService detects stale record writes during append and status transition", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-service-"));

  try {
    const service = createService(tempRoot);
    await seedWorkspace(service);
    await service.startInspectionRecord({
      id: "record-9",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const staleEnvelope = await service.repository.readInspectionRecordEnvelope("record-9");
    await service.repository.saveInspectionRecord(
      {
        ...staleEnvelope.record,
        items: [
          {
            id: "item-fresh",
            recordId: "record-9",
            checkpointId: "cp-1",
            resultType: "missing",
            reviewRequired: false
          }
        ]
      },
      { expectedSavedAt: staleEnvelope.savedAt }
    );

    await assert.rejects(
      () =>
        service.repository.saveInspectionRecord(
          {
            ...staleEnvelope.record,
            items: [
              {
                id: "item-stale",
                recordId: "record-9",
                checkpointId: "cp-1",
                resultType: "missing",
                reviewRequired: false
              }
            ]
          },
          { expectedSavedAt: staleEnvelope.savedAt }
        ),
      /Concurrent modification detected/
    );

    const staleForStatus = await service.repository.readInspectionRecordEnvelope("record-9");
    await service.sendInspectionRecordToReview("record-9");

    await assert.rejects(
      () =>
        service.repository.saveInspectionRecord(
          {
            ...staleForStatus.record,
            status: "finalized"
          },
          { expectedSavedAt: staleForStatus.savedAt }
        ),
      /Concurrent modification detected/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
