import {
  createBackupManifest,
  createInspectionRecord,
  createProjectCatalog,
  createReport,
  createProject
} from "../domain/models.js";

function assertId(id, fieldName) {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

export class BaseMarkRepository {
  constructor(options = {}) {
    if (!options.store) {
      throw new Error("BaseMarkRepository requires a store.");
    }

    this.store = options.store;
  }

  getProjectPath(projectId) {
    assertId(projectId, "projectId");
    return `projects/${projectId}.json`;
  }

  getInspectionRecordPath(recordId) {
    assertId(recordId, "recordId");
    return `records/${recordId}.json`;
  }

  getProjectCatalogPath(projectId) {
    assertId(projectId, "projectId");
    return `projects/${projectId}.catalog.json`;
  }

  getBackupManifestPath(manifestId) {
    assertId(manifestId, "manifestId");
    return `backups/${manifestId}.json`;
  }

  getReportPath(reportId) {
    assertId(reportId, "reportId");
    return `reports/${reportId}.json`;
  }

  async saveProject(project) {
    const payload = createProject(project);
    const fileName = this.getProjectPath(payload.id);

    await this.store.writeDocument(fileName, payload);
    return fileName;
  }

  async readProject(projectId) {
    const document = await this.store.readDocument(this.getProjectPath(projectId));
    return createProject(document.payload);
  }

  async listProjects() {
    const fileNames = await this.store.listDocuments("projects");
    const projectFiles = fileNames.filter(
      (fileName) => !fileName.endsWith(".catalog.json")
    );

    return Promise.all(
      projectFiles.map(async (fileName) => {
        const document = await this.store.readDocument(fileName);
        return createProject(document.payload);
      })
    );
  }

  async saveProjectCatalog(projectCatalog) {
    const payload = createProjectCatalog(projectCatalog);
    const fileName = this.getProjectCatalogPath(payload.projectId);

    await this.store.writeDocument(fileName, payload);
    return fileName;
  }

  async readProjectCatalog(projectId) {
    const document = await this.store.readDocument(this.getProjectCatalogPath(projectId));
    return createProjectCatalog(document.payload);
  }

  async saveInspectionRecord(record, options = {}) {
    const payload = createInspectionRecord(record);
    const fileName = this.getInspectionRecordPath(payload.id);

    await this.store.writeDocument(fileName, payload, options);
    return fileName;
  }

  async readInspectionRecord(recordId) {
    const document = await this.store.readDocument(
      this.getInspectionRecordPath(recordId)
    );
    return createInspectionRecord(document.payload);
  }

  async readInspectionRecordEnvelope(recordId) {
    const document = await this.store.readDocument(
      this.getInspectionRecordPath(recordId)
    );

    return {
      savedAt: document.savedAt,
      record: createInspectionRecord(document.payload)
    };
  }

  async listInspectionRecords(projectId) {
    const fileNames = await this.store.listDocuments("records");
    const records = await Promise.all(
      fileNames.map(async (fileName) => {
        const document = await this.store.readDocument(fileName);
        return createInspectionRecord(document.payload);
      })
    );

    if (!projectId) {
      return records;
    }

    return records.filter((record) => record.projectId === projectId);
  }

  async saveBackupManifest(manifest) {
    const payload = createBackupManifest(manifest);
    const fileName = this.getBackupManifestPath(payload.id);

    await this.store.writeDocument(fileName, payload);
    return fileName;
  }

  async readBackupManifest(manifestId) {
    const document = await this.store.readDocument(
      this.getBackupManifestPath(manifestId)
    );
    return createBackupManifest(document.payload);
  }

  async listBackupManifests() {
    const fileNames = await this.store.listDocuments("backups");
    return Promise.all(
      fileNames.map(async (fileName) => {
        const document = await this.store.readDocument(fileName);
        return createBackupManifest(document.payload);
      })
    );
  }

  async saveReport(report) {
    const payload = createReport(report);
    const fileName = this.getReportPath(payload.id);

    await this.store.writeDocument(fileName, payload);
    return fileName;
  }

  async readReport(reportId) {
    const document = await this.store.readDocument(this.getReportPath(reportId));
    return createReport(document.payload);
  }

  async listReports() {
    const fileNames = await this.store.listDocuments("reports");
    return Promise.all(
      fileNames.map(async (fileName) => {
        const document = await this.store.readDocument(fileName);
        return createReport(document.payload);
      })
    );
  }
}
