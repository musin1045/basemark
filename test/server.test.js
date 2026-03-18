import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createBaseMarkServer } from "../src/server/basemarkServer.js";

async function startServer(tempRoot) {
  const server = createBaseMarkServer({
    dataDir: path.join(tempRoot, "data")
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test("Local server serves the V1 shell page", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-server-"));

  try {
    const { server, baseUrl } = await startServer(tempRoot);

    try {
      const response = await fetch(baseUrl);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /BaseMark V1 Local Shell/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("Local server runs the workspace and record flow through HTTP routes", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-server-"));

  try {
    const { server, baseUrl } = await startServer(tempRoot);

    try {
      const workspaceResponse = await fetch(`${baseUrl}/api/workspace/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
        })
      });
      const workspace = await workspaceResponse.json();
      const projectsResponse = await fetch(`${baseUrl}/api/projects`);
      const projects = await projectsResponse.json();

      const startResponse = await fetch(`${baseUrl}/api/record/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "record-1",
          projectId: "project-1",
          baselineUnitId: "unit-baseline",
          comparisonUnitId: "unit-comparison",
          baselineVersion: "baseline-v1"
        })
      });
      const record = await startResponse.json();

      const addItemResponse = await fetch(`${baseUrl}/api/record/add-item`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: "record-1",
          item: {
            id: "item-1",
            checkpointId: "cp-1",
            resultType: "missing",
            reviewRequired: true,
            note: "Window outlet missing"
          }
        })
      });
      const updatedRecord = await addItemResponse.json();

      const recordsResponse = await fetch(
        `${baseUrl}/api/records?projectId=project-1`
      );
      const records = await recordsResponse.json();

      const finalizeResponse = await fetch(`${baseUrl}/api/record/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: "record-1"
        })
      });
      const finalizeError = await finalizeResponse.json();

      const reviewResponse = await fetch(`${baseUrl}/api/record/send-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: "record-1"
        })
      });
      const inReview = await reviewResponse.json();

      const finalResponse = await fetch(`${baseUrl}/api/record/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: "record-1"
        })
      });
      const finalized = await finalResponse.json();
      const reportGenerateResponse = await fetch(`${baseUrl}/api/report/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: "record-1"
        })
      });
      const generatedReport = await reportGenerateResponse.json();
      const reportsResponse = await fetch(`${baseUrl}/api/reports?projectId=project-1`);
      const reports = await reportsResponse.json();
      const backupExportResponse = await fetch(`${baseUrl}/api/backup/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-1"
        })
      });
      const exportedBackup = await backupExportResponse.json();
      const backupsResponse = await fetch(`${baseUrl}/api/backups`);
      const backups = await backupsResponse.json();
      const backupShowResponse = await fetch(
        `${baseUrl}/api/backup/show?backupId=${encodeURIComponent(exportedBackup.backupId)}`
      );
      const backupDetails = await backupShowResponse.json();

      assert.equal(workspace.project.id, "project-1");
      assert.equal(projects.length, 1);
      assert.equal(record.baselineSnapshot.unitId, "unit-baseline");
      assert.equal(updatedRecord.items.length, 1);
      assert.equal(records.length, 1);
      assert.equal(records[0].id, "record-1");
      assert.equal(finalizeResponse.status, 500);
      assert.match(finalizeError.error, /Invalid inspection record status transition/);
      assert.equal(inReview.status, "in_review");
      assert.equal(finalized.status, "finalized");
      assert.equal(generatedReport.report.recordId, "record-1");
      assert.equal(reports.length, 1);
      assert.equal(exportedBackup.manifest.projectIds[0], "project-1");
      assert.equal(backups.length, 1);
      assert.equal(backupDetails.manifest.id, exportedBackup.backupId);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
