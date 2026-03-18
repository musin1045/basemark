import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  createBackupManifest,
  createInspectionItem,
  createInspectionRecord,
  createProjectCatalog,
  createProject
} from "../domain/models.js";
import { SCHEMA_VERSION } from "../core/schema.js";

const MUTABLE_RECORD_STATUSES = new Set(["draft", "in_review"]);

function buildBaselineSnapshot(projectCatalog, baselineUnitId) {
  const unit = projectCatalog.units.find((entry) => entry.id === baselineUnitId);

  if (!unit) {
    throw new Error(`Baseline unit not found: ${baselineUnitId}.`);
  }

  const spaces = projectCatalog.spaces
    .filter((entry) => entry.unitId === baselineUnitId)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      label: entry.label
    }));

  const checkpoints = projectCatalog.checkpoints
    .filter((entry) => entry.unitId === baselineUnitId)
    .map((entry) => ({
      id: entry.id,
      spaceId: entry.spaceId,
      label: entry.label,
      mapPin: entry.mapPin
    }));

  return {
    unitId: unit.id,
    unitName: unit.name,
    spaces,
    checkpoints
  };
}

function getUnit(projectCatalog, unitId, fieldName) {
  const unit = projectCatalog.units.find((entry) => entry.id === unitId);

  if (!unit) {
    throw new Error(`${fieldName} not found: ${unitId}.`);
  }

  return unit;
}

function assertRecordStatusTransition(currentStatus, nextStatus) {
  const allowedTransitions = {
    draft: new Set(["in_review"]),
    in_review: new Set(["draft", "finalized"]),
    finalized: new Set([])
  };

  if (!allowedTransitions[currentStatus]?.has(nextStatus)) {
    throw new Error(
      `Invalid inspection record status transition: ${currentStatus} -> ${nextStatus}.`
    );
  }
}

function assertCheckpointInFrozenBaseline(record, checkpointId) {
  if (!checkpointId) {
    return;
  }

  const allowedCheckpointIds = new Set(
    (record.baselineSnapshot.checkpoints ?? []).map((entry) => entry.id)
  );

  if (!allowedCheckpointIds.has(checkpointId)) {
    throw new Error(
      `Checkpoint ${checkpointId} is outside the frozen baseline snapshot.`
    );
  }
}

function assertRecordMutable(record) {
  if (!MUTABLE_RECORD_STATUSES.has(record.status)) {
    throw new Error(
      `Inspection record cannot be modified while ${record.status}.`
    );
  }
}

function createSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createTimestampIdPart(createdAt) {
  return createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function createImportedId(baseId, timestampPart, existingIds) {
  let suffix = 1;
  let candidate = `${baseId}-import-${timestampPart}-${suffix}`;

  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-import-${timestampPart}-${suffix}`;
  }

  existingIds.add(candidate);
  return candidate;
}

function createReportMarkdown(project, record) {
  const counts = {
    missing: 0,
    extra: 0,
    position_diff: 0,
    ok: 0
  };

  for (const item of record.items) {
    counts[item.resultType] = (counts[item.resultType] ?? 0) + 1;
  }

  const itemLines = record.items.map((item) => {
    const checkpoint = item.checkpointId ?? "ad-hoc";
    const note = item.note ? ` - ${item.note}` : "";
    const review = item.reviewRequired ? " [review]" : "";
    return `- ${item.id}: ${item.resultType} (${checkpoint})${review}${note}`;
  });

  return [
    `# BaseMark Inspection Report`,
    ``,
    `- Project: ${project.name} (${project.id})`,
    `- Record: ${record.id}`,
    `- Status: ${record.status}`,
    `- Baseline Version: ${record.baselineVersion}`,
    `- Baseline Unit: ${record.baselineSnapshot.unitName ?? record.baselineUnitId}`,
    `- Comparison Unit: ${record.comparisonUnitId}`,
    `- Generated At: ${new Date().toISOString()}`,
    ``,
    `## Summary`,
    ``,
    `- Missing: ${counts.missing}`,
    `- Extra: ${counts.extra}`,
    `- Position Diff: ${counts.position_diff}`,
    `- Review Required: ${record.reviewRequired ? "yes" : "no"}`,
    ``,
    `## Items`,
    ``,
    ...(itemLines.length > 0 ? itemLines : ["- No inspection items recorded."]),
    ``
  ].join("\n");
}

async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true });
}

export class BaseMarkService {
  constructor(options = {}) {
    if (!options.repository) {
      throw new Error("BaseMarkService requires a repository.");
    }

    this.repository = options.repository;
    this.exportDir =
      options.exportDir ??
      path.resolve(this.repository.store.rootDir, "..", "exports");
  }

  async createProjectWorkspace(input) {
    const project = createProject(input.project);
    const projectCatalog = createProjectCatalog({
      projectId: project.id,
      units: input.units ?? [],
      spaces: input.spaces ?? [],
      checkpoints: input.checkpoints ?? []
    });

    await this.repository.saveProject(project);
    await this.repository.saveProjectCatalog(projectCatalog);

    return {
      project,
      catalog: projectCatalog
    };
  }

  async loadProjectWorkspace(projectId) {
    const project = await this.repository.readProject(projectId);
    const catalog = await this.repository.readProjectCatalog(projectId);

    return {
      project,
      catalog
    };
  }

  async listProjects() {
    return this.repository.listProjects();
  }

  async listInspectionRecords(projectId) {
    return this.repository.listInspectionRecords(projectId);
  }

  async listBackupManifests() {
    return this.repository.listBackupManifests();
  }

  async listReports(projectId) {
    const reports = await this.repository.listReports();

    if (!projectId) {
      return reports;
    }

    const records = await this.repository.listInspectionRecords(projectId);
    const allowedRecordIds = new Set(records.map((record) => record.id));
    return reports.filter((report) => allowedRecordIds.has(report.recordId));
  }

  async getReportDetails(reportId) {
    const report = await this.repository.readReport(reportId);
    const content = await this.repository.store.readRawText(report.fileName);

    return {
      report,
      content
    };
  }

  async listBackupPackages() {
    await ensureDirectory(this.exportDir);
    const entries = await readdir(this.exportDir, { withFileTypes: true });
    const packageDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    return Promise.all(
      packageDirs.map(async (backupId) => {
        const details = await this.inspectBackupPackage(backupId);
        return {
          id: details.manifest.id,
          createdAt: details.manifest.createdAt,
          projectIds: details.manifest.projectIds,
          fileCount: details.manifest.fileCount,
          exportMode: details.manifest.exportMode,
          packagePath: details.packagePath
        };
      })
    );
  }

  async startInspectionRecord(input) {
    const projectCatalog = await this.repository.readProjectCatalog(input.projectId);
    const baselineUnit = getUnit(
      projectCatalog,
      input.baselineUnitId,
      "baselineUnitId"
    );
    const comparisonUnit = getUnit(
      projectCatalog,
      input.comparisonUnitId,
      "comparisonUnitId"
    );

    if (baselineUnit.kind !== "baseline") {
      throw new Error("baselineUnitId must reference a baseline unit.");
    }

    if (comparisonUnit.kind !== "comparison") {
      throw new Error("comparisonUnitId must reference a comparison unit.");
    }

    const record = createInspectionRecord({
      id: input.id,
      projectId: input.projectId,
      baselineUnitId: input.baselineUnitId,
      comparisonUnitId: input.comparisonUnitId,
      status: "draft",
      baselineVersion: input.baselineVersion,
      baselineSnapshot: buildBaselineSnapshot(
        projectCatalog,
        input.baselineUnitId
      ),
      items: []
    });

    await this.repository.saveInspectionRecord(record);
    return record;
  }

  async appendInspectionItem(input) {
    const record = await this.repository.readInspectionRecord(input.recordId);
    assertRecordMutable(record);
    assertCheckpointInFrozenBaseline(record, input.item.checkpointId);

    const item = createInspectionItem({
      ...input.item,
      recordId: input.recordId
    });

    const nextRecord = createInspectionRecord({
      ...record,
      items: [...record.items, item]
    });

    await this.repository.saveInspectionRecord(nextRecord);
    return nextRecord;
  }

  async sendInspectionRecordToReview(recordId) {
    return this.#updateInspectionRecordStatus(recordId, "in_review");
  }

  async reopenInspectionRecord(recordId) {
    return this.#updateInspectionRecordStatus(recordId, "draft");
  }

  async finalizeInspectionRecord(recordId) {
    return this.#updateInspectionRecordStatus(recordId, "finalized");
  }

  async exportProjectBackup(projectId) {
    const project = await this.repository.readProject(projectId);
    const catalog = await this.repository.readProjectCatalog(projectId);
    const records = await this.repository.listInspectionRecords(projectId);
    const reports = await this.listReports(projectId);
    const createdAt = new Date().toISOString();
    const backupId = `backup-${projectId}-${createTimestampIdPart(createdAt)}`;
    const packagePath = path.join(this.exportDir, backupId);
    const files = [
      this.repository.getProjectPath(projectId),
      this.repository.getProjectCatalogPath(projectId),
      ...records.map((record) => this.repository.getInspectionRecordPath(record.id)),
      ...reports.map((report) => this.repository.getReportPath(report.id)),
      ...reports.map((report) => report.fileName)
    ];

    await ensureDirectory(packagePath);

    const fileEntries = [];

    for (const fileName of files) {
      const raw = await this.repository.store.readRawText(fileName);
      const targetPath = path.join(packagePath, fileName);

      await ensureDirectory(path.dirname(targetPath));
      await writeFile(targetPath, raw, "utf8");
      fileEntries.push({
        path: fileName.replace(/\\/g, "/"),
        sha256: createSha256(raw)
      });
    }

    const manifest = createBackupManifest({
      id: backupId,
      createdAt,
      schemaVersion: String(SCHEMA_VERSION),
      projectIds: [project.id],
      fileCount: fileEntries.length,
      exportMode: "manual_folder",
      files: fileEntries
    });

    await writeFile(
      path.join(packagePath, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    await this.repository.saveBackupManifest(manifest);

    return {
      backupId,
      packagePath,
      manifest
    };
  }

  async inspectBackupPackage(backupId) {
    const packagePath = path.join(this.exportDir, backupId);
    const rawManifest = await readFile(path.join(packagePath, "manifest.json"), "utf8");
    const manifest = createBackupManifest(JSON.parse(rawManifest));

    return {
      backupId,
      packagePath,
      manifest
    };
  }

  async restoreBackupPackage(backupId) {
    const { packagePath, manifest } = await this.inspectBackupPackage(backupId);
    const existingProjects = new Set(
      (await this.repository.listProjects()).map((project) => project.id)
    );
    const existingRecords = new Set(
      (await this.repository.listInspectionRecords()).map((record) => record.id)
    );
    const existingReports = new Set(
      (await this.repository.listReports()).map((report) => report.id)
    );
    const timestampPart = createTimestampIdPart(new Date().toISOString());
    const projectIdMap = new Map();
    const recordIdMap = new Map();
    const reportIdMap = new Map();

    for (const projectId of manifest.projectIds) {
      const nextProjectId = existingProjects.has(projectId)
        ? createImportedId(projectId, timestampPart, existingProjects)
        : projectId;
      existingProjects.add(nextProjectId);
      projectIdMap.set(projectId, nextProjectId);
    }

    for (const file of manifest.files) {
      const raw = await readFile(path.join(packagePath, file.path), "utf8");
      const document = JSON.parse(raw);

      if (file.path.startsWith("projects/") && file.path.endsWith(".catalog.json")) {
        const nextProjectId =
          projectIdMap.get(document.payload.projectId) ?? document.payload.projectId;
        await this.repository.saveProjectCatalog({
          ...document.payload,
          projectId: nextProjectId,
          units: document.payload.units.map((unit) => ({
            ...unit,
            projectId: nextProjectId
          }))
        });
        continue;
      }

      if (file.path.startsWith("projects/") && file.path.endsWith(".json")) {
        const nextProjectId =
          projectIdMap.get(document.payload.id) ?? document.payload.id;
        await this.repository.saveProject({
          ...document.payload,
          id: nextProjectId
        });
        continue;
      }

      if (file.path.startsWith("records/")) {
        const originalRecordId = document.payload.id;
        const mappedProjectId =
          projectIdMap.get(document.payload.projectId) ?? document.payload.projectId;
        const nextRecordId =
          projectIdMap.get(document.payload.projectId) !== undefined ||
          existingRecords.has(originalRecordId)
            ? createImportedId(originalRecordId, timestampPart, existingRecords)
            : originalRecordId;

        existingRecords.add(nextRecordId);
        recordIdMap.set(originalRecordId, nextRecordId);

        await this.repository.saveInspectionRecord({
          ...document.payload,
          id: nextRecordId,
          projectId: mappedProjectId,
          items: document.payload.items.map((item) => ({
            ...item,
            recordId: nextRecordId
          }))
        });
        continue;
      }

      if (file.path.startsWith("reports/")) {
        const originalReportId = document.payload.id;
        const nextReportId = existingReports.has(originalReportId)
          ? createImportedId(originalReportId, timestampPart, existingReports)
          : originalReportId;
        const nextRecordId =
          recordIdMap.get(document.payload.recordId) ?? document.payload.recordId;
        const reportPath = `report-files/${nextReportId}.md`;

        existingReports.add(nextReportId);
        reportIdMap.set(originalReportId, nextReportId);

        await this.repository.saveReport({
          ...document.payload,
          id: nextReportId,
          recordId: nextRecordId,
          fileName: reportPath
        });
        continue;
      }

      if (file.path.startsWith("report-files/")) {
        const sourceReportId = path.basename(file.path, ".md");
        const nextReportId = reportIdMap.get(sourceReportId) ?? sourceReportId;
        await this.repository.store.writeRawText(`report-files/${nextReportId}.md`, raw);
      }
    }

    return {
      backupId,
      restoredProjects: manifest.projectIds.map((projectId) => ({
        sourceProjectId: projectId,
        projectId: projectIdMap.get(projectId) ?? projectId,
        imported: (projectIdMap.get(projectId) ?? projectId) !== projectId
      })),
      restoredRecords: Array.from(recordIdMap.entries()).map(
        ([sourceRecordId, recordId]) => ({
          sourceRecordId,
          recordId
        })
      )
    };
  }

  async generateInspectionReport(recordId) {
    const record = await this.repository.readInspectionRecord(recordId);

    if (record.status !== "finalized") {
      throw new Error("Inspection record must be finalized before report generation.");
    }

    const project = await this.repository.readProject(record.projectId);
    const generatedAt = new Date().toISOString();
    const reportId = `report-${record.id}`;
    const fileName = `report-files/${reportId}.md`;
    const content = createReportMarkdown(project, record);

    await this.repository.store.writeRawText(fileName, content);

    const report = {
      id: reportId,
      recordId: record.id,
      fileName,
      generatedAt
    };

    await this.repository.saveReport(report);

    return {
      report: await this.repository.readReport(reportId),
      content
    };
  }

  async #updateInspectionRecordStatus(recordId, nextStatus) {
    const record = await this.repository.readInspectionRecord(recordId);
    assertRecordStatusTransition(record.status, nextStatus);

    const nextRecord = createInspectionRecord({
      ...record,
      status: nextStatus
    });

    await this.repository.saveInspectionRecord(nextRecord);
    return nextRecord;
  }
}
