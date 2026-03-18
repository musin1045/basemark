const RESULT_TYPES = ["missing", "extra", "position_diff", "ok"];
const RECORD_STATUSES = ["draft", "in_review", "finalized"];

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertOptionalString(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
}

function assertOptionalArray(value, fieldName) {
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array when provided.`);
  }
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `${fieldName} must be one of: ${allowedValues.join(", ")}.`
    );
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProject(input) {
  assertObject(input, "project");
  assertNonEmptyString(input.id, "project.id");
  assertNonEmptyString(input.name, "project.name");

  return {
    id: input.id,
    name: input.name,
    siteName: input.siteName ?? null,
    notes: input.notes ?? null
  };
}

export function createUnit(input) {
  assertObject(input, "unit");
  assertNonEmptyString(input.id, "unit.id");
  assertNonEmptyString(input.projectId, "unit.projectId");
  assertNonEmptyString(input.name, "unit.name");
  assertEnum(input.kind, ["baseline", "comparison"], "unit.kind");

  return {
    id: input.id,
    projectId: input.projectId,
    name: input.name,
    kind: input.kind
  };
}

export function createSpace(input) {
  assertObject(input, "space");
  assertNonEmptyString(input.id, "space.id");
  assertNonEmptyString(input.unitId, "space.unitId");
  assertNonEmptyString(input.name, "space.name");

  return {
    id: input.id,
    unitId: input.unitId,
    name: input.name,
    label: input.label ?? null
  };
}

export function createCheckpoint(input) {
  assertObject(input, "checkpoint");
  assertNonEmptyString(input.id, "checkpoint.id");
  assertNonEmptyString(input.unitId, "checkpoint.unitId");
  assertNonEmptyString(input.spaceId, "checkpoint.spaceId");
  assertNonEmptyString(input.label, "checkpoint.label");

  return {
    id: input.id,
    unitId: input.unitId,
    spaceId: input.spaceId,
    label: input.label,
    mapPin: input.mapPin ?? null
  };
}

export function createProjectCatalog(input) {
  assertObject(input, "projectCatalog");
  assertNonEmptyString(input.projectId, "projectCatalog.projectId");

  return {
    projectId: input.projectId,
    units: (input.units ?? []).map(createUnit),
    spaces: (input.spaces ?? []).map(createSpace),
    checkpoints: (input.checkpoints ?? []).map(createCheckpoint)
  };
}

export function createInspectionItem(input) {
  assertObject(input, "inspectionItem");
  assertNonEmptyString(input.id, "inspectionItem.id");
  assertNonEmptyString(input.recordId, "inspectionItem.recordId");
  assertEnum(input.resultType, RESULT_TYPES, "inspectionItem.resultType");

  if (typeof input.reviewRequired !== "boolean") {
    throw new Error("inspectionItem.reviewRequired must be a boolean.");
  }

  assertOptionalString(input.checkpointId, "inspectionItem.checkpointId");
  assertOptionalString(input.spaceId, "inspectionItem.spaceId");
  assertOptionalString(input.note, "inspectionItem.note");

  if (input.resultType === "extra" && input.checkpointId) {
    throw new Error(
      "inspectionItem.checkpointId must be empty for extra items by default."
    );
  }

  if (input.resultType !== "extra" && !input.checkpointId) {
    throw new Error(
      "inspectionItem.checkpointId is required for non-extra result types."
    );
  }

  return {
    id: input.id,
    recordId: input.recordId,
    checkpointId: input.checkpointId ?? null,
    spaceId: input.spaceId ?? null,
    resultType: input.resultType,
    reviewRequired: input.reviewRequired,
    note: input.note ?? null
  };
}

export function createInspectionRecord(input) {
  assertObject(input, "inspectionRecord");
  assertNonEmptyString(input.id, "inspectionRecord.id");
  assertNonEmptyString(input.projectId, "inspectionRecord.projectId");
  assertNonEmptyString(input.baselineUnitId, "inspectionRecord.baselineUnitId");
  assertNonEmptyString(
    input.comparisonUnitId,
    "inspectionRecord.comparisonUnitId"
  );
  assertEnum(input.status, RECORD_STATUSES, "inspectionRecord.status");
  assertObject(input.baselineSnapshot, "inspectionRecord.baselineSnapshot");
  assertNonEmptyString(
    input.baselineVersion,
    "inspectionRecord.baselineVersion"
  );
  assertArray(input.items, "inspectionRecord.items");

  const items = input.items.map((item) =>
    createInspectionItem({
      ...item,
      recordId: item.recordId ?? input.id
    })
  );

  return {
    id: input.id,
    projectId: input.projectId,
    baselineUnitId: input.baselineUnitId,
    comparisonUnitId: input.comparisonUnitId,
    status: input.status,
    baselineVersion: input.baselineVersion,
    baselineSnapshot: clone(input.baselineSnapshot),
    reviewRequired: items.some((item) => item.reviewRequired),
    items
  };
}

export function createReport(input) {
  assertObject(input, "report");
  assertNonEmptyString(input.id, "report.id");
  assertNonEmptyString(input.recordId, "report.recordId");
  assertNonEmptyString(input.fileName, "report.fileName");

  return {
    id: input.id,
    recordId: input.recordId,
    fileName: input.fileName,
    generatedAt: input.generatedAt ?? null
  };
}

export function createBackupManifest(input) {
  assertObject(input, "backupManifest");
  assertNonEmptyString(input.id, "backupManifest.id");
  assertNonEmptyString(input.createdAt, "backupManifest.createdAt");
  assertNonEmptyString(input.schemaVersion, "backupManifest.schemaVersion");
  assertArray(input.files, "backupManifest.files");
  assertOptionalArray(input.projectIds, "backupManifest.projectIds");
  assertOptionalString(input.exportMode, "backupManifest.exportMode");

  if (
    input.fileCount !== undefined &&
    input.fileCount !== null &&
    !Number.isInteger(input.fileCount)
  ) {
    throw new Error("backupManifest.fileCount must be an integer when provided.");
  }

  for (const file of input.files) {
    assertObject(file, "backupManifest.files[]");
    assertNonEmptyString(file.path, "backupManifest.files[].path");
    assertNonEmptyString(file.sha256, "backupManifest.files[].sha256");
  }

  return {
    id: input.id,
    createdAt: input.createdAt,
    schemaVersion: input.schemaVersion,
    projectIds: (input.projectIds ?? []).map((projectId) => {
      assertNonEmptyString(projectId, "backupManifest.projectIds[]");
      return projectId;
    }),
    fileCount: input.fileCount ?? input.files.length,
    exportMode: input.exportMode ?? null,
    files: input.files.map((file) => ({
      path: file.path,
      sha256: file.sha256
    }))
  };
}

export function createBaseMarkModel(input) {
  assertObject(input, "model");

  return {
    project: createProject(input.project),
    units: (input.units ?? []).map(createUnit),
    spaces: (input.spaces ?? []).map(createSpace),
    checkpoints: (input.checkpoints ?? []).map(createCheckpoint),
    inspectionRecords: (input.inspectionRecords ?? []).map(createInspectionRecord),
    reports: (input.reports ?? []).map(createReport),
    backupManifest: input.backupManifest
      ? createBackupManifest(input.backupManifest)
      : null
  };
}

export const BASEMARK_RESULT_TYPES = RESULT_TYPES;
export const BASEMARK_RECORD_STATUSES = RECORD_STATUSES;
