import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BaseMarkRepository } from "../src/storage/basemarkRepository.js";
import { LocalStore } from "../src/storage/localStore.js";

test("BaseMarkRepository persists project documents in a stable relative path", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    const fileName = await repository.saveProject({
      id: "project-1",
      name: "Tower A",
      siteName: "Seoul"
    });

    const project = await repository.readProject("project-1");

    assert.equal(fileName, "projects/project-1.json");
    assert.equal(project.name, "Tower A");
    assert.equal(project.siteName, "Seoul");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkRepository persists inspection records under records/", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    const fileName = await repository.saveInspectionRecord({
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
          resultType: "missing",
          reviewRequired: true
        },
        {
          id: "item-2",
          resultType: "extra",
          reviewRequired: false,
          note: "Unexpected switch"
        }
      ]
    });

    const record = await repository.readInspectionRecord("record-1");

    assert.equal(fileName, "records/record-1.json");
    assert.equal(record.items[0].recordId, "record-1");
    assert.equal(record.items[1].checkpointId, null);
    assert.equal(record.reviewRequired, true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkRepository persists project catalogs beside project documents", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    const fileName = await repository.saveProjectCatalog({
      projectId: "project-1",
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

    const catalog = await repository.readProjectCatalog("project-1");

    assert.equal(fileName, "projects/project-1.catalog.json");
    assert.equal(catalog.units[0].id, "unit-baseline");
    assert.equal(catalog.checkpoints[0].label, "Window A");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkRepository persists backup manifests with stable relative file references", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    const fileName = await repository.saveBackupManifest({
      id: "backup-1",
      createdAt: "2026-03-18T00:00:00.000Z",
      schemaVersion: "1",
      files: [
        {
          path: "projects/project-1.json",
          sha256: "abc123"
        },
        {
          path: "records/record-1.json",
          sha256: "def456"
        }
      ]
    });

    const manifest = await repository.readBackupManifest("backup-1");

    assert.equal(fileName, "backups/backup-1.json");
    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ["projects/project-1.json", "records/record-1.json"]
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkRepository lists stored projects and inspection records", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    await repository.saveProject({
      id: "project-1",
      name: "Tower A"
    });
    await repository.saveProject({
      id: "project-2",
      name: "Tower B"
    });

    await repository.saveInspectionRecord({
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
      items: []
    });
    await repository.saveInspectionRecord({
      id: "record-2",
      projectId: "project-2",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      status: "draft",
      baselineVersion: "baseline-v1",
      baselineSnapshot: {
        unitId: "unit-baseline",
        checkpoints: [{ id: "cp-2", label: "Door frame" }]
      },
      items: []
    });

    const projects = await repository.listProjects();
    const projectOneRecords = await repository.listInspectionRecords("project-1");

    assert.deepEqual(
      projects.map((project) => project.id),
      ["project-1", "project-2"]
    );
    assert.deepEqual(
      projectOneRecords.map((record) => record.id),
      ["record-1"]
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkRepository lists stored backup manifests", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    await repository.saveBackupManifest({
      id: "backup-1",
      createdAt: "2026-03-18T00:00:00.000Z",
      schemaVersion: "1",
      projectIds: ["project-1"],
      fileCount: 1,
      exportMode: "manual_folder",
      files: [
        {
          path: "projects/project-1.json",
          sha256: "abc123"
        }
      ]
    });

    const manifests = await repository.listBackupManifests();

    assert.equal(manifests.length, 1);
    assert.equal(manifests[0].id, "backup-1");
    assert.equal(manifests[0].projectIds[0], "project-1");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("BaseMarkRepository persists and lists reports", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-repo-"));

  try {
    const repository = new BaseMarkRepository({
      store: new LocalStore({ rootDir: tempRoot })
    });

    const fileName = await repository.saveReport({
      id: "report-record-1",
      recordId: "record-1",
      fileName: "report-files/report-record-1.md",
      generatedAt: "2026-03-18T00:00:00.000Z"
    });
    const report = await repository.readReport("report-record-1");
    const reports = await repository.listReports();

    assert.equal(fileName, "reports/report-record-1.json");
    assert.equal(report.fileName, "report-files/report-record-1.md");
    assert.equal(reports.length, 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
