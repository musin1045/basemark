import { mkdir, readFile, writeFile } from "node:fs/promises";
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
}
