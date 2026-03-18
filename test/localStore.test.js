import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SCHEMA_VERSION } from "../src/core/schema.js";
import { LocalStore } from "../src/storage/localStore.js";

test("LocalStore writes schema-versioned documents under a local root", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-store-"));

  try {
    const store = new LocalStore({ rootDir: tempRoot });
    const fileName = "records/sample.json";
    const payload = {
      projectId: "project-1",
      resultTypes: ["missing", "extra", "position_diff"]
    };

    const savedPath = await store.writeDocument(fileName, payload);
    const document = await store.readDocument(fileName);

    assert.equal(savedPath, path.join(tempRoot, fileName));
    assert.equal(document.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(document.payload, payload);
    assert.equal(typeof document.savedAt, "string");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("LocalStore rejects unsupported schema versions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-store-"));

  try {
    const fileName = "records/old.json";
    const targetPath = path.join(tempRoot, fileName);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      targetPath,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION + 1,
        payload: {}
      }),
      "utf8"
    );

    const store = new LocalStore({ rootDir: tempRoot });

    await assert.rejects(
      () => store.readDocument(fileName),
      /Unsupported schema version/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("LocalStore rejects unsafe absolute or parent paths", async () => {
  const store = new LocalStore({ rootDir: "C:/basemark/data" });

  await assert.rejects(
    () => store.writeDocument("../escape.json", {}),
    /safe relative path/
  );

  await assert.rejects(
    () => store.writeDocument("C:/absolute.json", {}),
    /safe relative path/
  );
});

test("LocalStore lists stored documents under a relative directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-store-"));

  try {
    const store = new LocalStore({ rootDir: tempRoot });

    await store.writeDocument("projects/project-2.json", { id: "project-2" });
    await store.writeDocument("projects/project-1.json", { id: "project-1" });

    const files = await store.listDocuments("projects");

    assert.deepEqual(files, ["projects/project-1.json", "projects/project-2.json"]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("LocalStore reads and writes raw text under a relative path", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-store-"));

  try {
    const store = new LocalStore({ rootDir: tempRoot });

    await store.writeRawText("exports/sample/manifest.json", "{\"ok\":true}");
    const raw = await store.readRawText("exports/sample/manifest.json");

    assert.equal(raw, "{\"ok\":true}");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
