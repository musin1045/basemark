import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../src/cli/basemarkCli.js";

function createMemoryIo() {
  let stdout = "";
  let stderr = "";

  return {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    },
    getStdout() {
      return stdout;
    },
    getStderr() {
      return stderr;
    }
  };
}

async function writeJson(tempRoot, fileName, value) {
  const filePath = path.join(tempRoot, fileName);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  return filePath;
}

test("CLI creates a workspace and starts an inspection record", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-cli-"));

  try {
    const workspaceInput = await writeJson(tempRoot, "workspace.json", {
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
    });

    const recordInput = await writeJson(tempRoot, "record.json", {
      id: "record-1",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const workspaceIo = createMemoryIo();
    const initExitCode = await runCli(
      [
        "workspace:init",
        "--data-dir",
        path.join(tempRoot, "data"),
        "--input",
        workspaceInput
      ],
      workspaceIo
    );

    const recordIo = createMemoryIo();
    const recordExitCode = await runCli(
      [
        "record:start",
        "--data-dir",
        path.join(tempRoot, "data"),
        "--input",
        recordInput
      ],
      recordIo
    );

    assert.equal(initExitCode, 0);
    assert.equal(recordExitCode, 0);
    assert.equal(JSON.parse(workspaceIo.getStdout()).project.id, "project-1");
    assert.equal(JSON.parse(recordIo.getStdout()).baselineSnapshot.unitId, "unit-baseline");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI appends items and moves a record through review to finalized", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-cli-"));
  const dataDir = path.join(tempRoot, "data");

  try {
    const workspaceInput = await writeJson(tempRoot, "workspace.json", {
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
          name: "Entry"
        }
      ],
      checkpoints: [
        {
          id: "cp-1",
          unitId: "unit-baseline",
          spaceId: "space-1",
          label: "Door frame"
        }
      ]
    });

    const recordInput = await writeJson(tempRoot, "record.json", {
      id: "record-2",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });

    const itemInput = await writeJson(tempRoot, "item.json", {
      recordId: "record-2",
      item: {
        id: "item-1",
        checkpointId: "cp-1",
        resultType: "missing",
        reviewRequired: true,
        note: "Socket missing"
      }
    });

    await runCli(
      ["workspace:init", "--data-dir", dataDir, "--input", workspaceInput],
      createMemoryIo()
    );
    await runCli(
      ["record:start", "--data-dir", dataDir, "--input", recordInput],
      createMemoryIo()
    );

    const addItemIo = createMemoryIo();
    const reviewIo = createMemoryIo();
    const finalizeIo = createMemoryIo();

    const addItemExitCode = await runCli(
      ["record:add-item", "--data-dir", dataDir, "--input", itemInput],
      addItemIo
    );
    const reviewExitCode = await runCli(
      ["record:send-review", "--data-dir", dataDir, "--record-id", "record-2"],
      reviewIo
    );
    const finalizeExitCode = await runCli(
      ["record:finalize", "--data-dir", dataDir, "--record-id", "record-2"],
      finalizeIo
    );

    assert.equal(addItemExitCode, 0);
    assert.equal(reviewExitCode, 0);
    assert.equal(finalizeExitCode, 0);
    assert.equal(JSON.parse(addItemIo.getStdout()).items.length, 1);
    assert.equal(JSON.parse(reviewIo.getStdout()).status, "in_review");
    assert.equal(JSON.parse(finalizeIo.getStdout()).status, "finalized");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI returns a non-zero exit code for invalid commands", async () => {
  const io = createMemoryIo();
  const exitCode = await runCli(["record:unknown"], io);

  assert.equal(exitCode, 1);
  assert.match(io.getStderr(), /Unknown command/);
});

test("CLI exports and restores a backup package", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-cli-src-"));
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-cli-dst-"));
  const exportRoot = path.join(os.tmpdir(), `basemark-cli-export-${Date.now()}`);

  try {
    const workspaceInput = await writeJson(sourceRoot, "workspace.json", {
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
    });

    await runCli(
      [
        "workspace:init",
        "--data-dir",
        path.join(sourceRoot, "data"),
        "--export-dir",
        exportRoot,
        "--input",
        workspaceInput
      ],
      createMemoryIo()
    );

    const exportIo = createMemoryIo();
    const exportExitCode = await runCli(
      [
        "backup:export",
        "--data-dir",
        path.join(sourceRoot, "data"),
        "--export-dir",
        exportRoot,
        "--project-id",
        "project-1"
      ],
      exportIo
    );
    const exportResult = JSON.parse(exportIo.getStdout());

    await runCli(
      [
        "workspace:init",
        "--data-dir",
        path.join(targetRoot, "data"),
        "--export-dir",
        exportRoot,
        "--input",
        workspaceInput
      ],
      createMemoryIo()
    );

    const restoreIo = createMemoryIo();
    const restoreExitCode = await runCli(
      [
        "backup:restore",
        "--data-dir",
        path.join(targetRoot, "data"),
        "--export-dir",
        exportRoot,
        "--backup-id",
        exportResult.backupId
      ],
      restoreIo
    );

    assert.equal(exportExitCode, 0);
    assert.equal(restoreExitCode, 0);
    assert.equal(exportResult.manifest.projectIds[0], "project-1");
    assert.equal(JSON.parse(restoreIo.getStdout()).restoredProjects[0].imported, true);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("CLI generates and lists reports for a finalized record", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "basemark-cli-"));
  const dataDir = path.join(tempRoot, "data");

  try {
    const workspaceInput = await writeJson(tempRoot, "workspace.json", {
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
          name: "Entry"
        }
      ],
      checkpoints: [
        {
          id: "cp-1",
          unitId: "unit-baseline",
          spaceId: "space-1",
          label: "Door frame"
        }
      ]
    });
    const recordInput = await writeJson(tempRoot, "record.json", {
      id: "record-3",
      projectId: "project-1",
      baselineUnitId: "unit-baseline",
      comparisonUnitId: "unit-comparison",
      baselineVersion: "baseline-v1"
    });
    const itemInput = await writeJson(tempRoot, "item.json", {
      recordId: "record-3",
      item: {
        id: "item-1",
        checkpointId: "cp-1",
        resultType: "missing",
        reviewRequired: false,
        note: "Door frame missing"
      }
    });

    await runCli(["workspace:init", "--data-dir", dataDir, "--input", workspaceInput], createMemoryIo());
    await runCli(["record:start", "--data-dir", dataDir, "--input", recordInput], createMemoryIo());
    await runCli(["record:add-item", "--data-dir", dataDir, "--input", itemInput], createMemoryIo());
    await runCli(["record:send-review", "--data-dir", dataDir, "--record-id", "record-3"], createMemoryIo());
    await runCli(["record:finalize", "--data-dir", dataDir, "--record-id", "record-3"], createMemoryIo());

    const generateIo = createMemoryIo();
    const listIo = createMemoryIo();
    const generateExitCode = await runCli(
      ["report:generate", "--data-dir", dataDir, "--record-id", "record-3"],
      generateIo
    );
    const listExitCode = await runCli(
      ["report:list", "--data-dir", dataDir, "--project-id", "project-1"],
      listIo
    );

    assert.equal(generateExitCode, 0);
    assert.equal(listExitCode, 0);
    assert.equal(JSON.parse(generateIo.getStdout()).report.recordId, "record-3");
    assert.equal(JSON.parse(listIo.getStdout()).length, 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
