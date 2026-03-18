import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SCHEMA_VERSION } from "../core/schema.js";

function ensureRelativePath(fileName) {
  if (!fileName || path.isAbsolute(fileName) || fileName.includes("..")) {
    throw new Error("Storage file name must be a safe relative path.");
  }
}

export class LocalStore {
  constructor(options = {}) {
    this.rootDir = options.rootDir ?? path.resolve(process.cwd(), "data");
  }

  resolvePath(fileName) {
    ensureRelativePath(fileName);
    return path.join(this.rootDir, fileName);
  }

  async writeDocument(fileName, payload) {
    const targetPath = this.resolvePath(fileName);
    await mkdir(path.dirname(targetPath), { recursive: true });

    const document = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      payload
    };

    await writeFile(targetPath, JSON.stringify(document, null, 2), "utf8");
    return targetPath;
  }

  async readDocument(fileName) {
    const sourcePath = this.resolvePath(fileName);
    const raw = await readFile(sourcePath, "utf8");
    const document = JSON.parse(raw);

    if (document.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(
        `Unsupported schema version: ${document.schemaVersion}. Expected ${SCHEMA_VERSION}.`
      );
    }

    return document;
  }

  async readRawText(fileName) {
    const sourcePath = this.resolvePath(fileName);
    return readFile(sourcePath, "utf8");
  }

  async writeRawText(fileName, content) {
    const targetPath = this.resolvePath(fileName);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
    return targetPath;
  }

  async listDocuments(directoryName) {
    const sourcePath = this.resolvePath(directoryName);
    const entries = await readdir(sourcePath, { withFileTypes: true }).catch(
      (error) => {
        if (error.code === "ENOENT") {
          return [];
        }

        throw error;
      }
    );

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.posix.join(directoryName, entry.name))
      .sort();
  }
}
