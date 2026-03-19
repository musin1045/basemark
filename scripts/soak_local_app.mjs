import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createBaseMarkServer } from "../src/server/basemarkServer.js";

function parseArgs(argv) {
  const options = {
    durationMs: 5 * 60 * 60 * 1000,
    intervalMs: 60 * 1000,
    port: 3010,
    dataDir: path.resolve(process.cwd(), "artifacts", "soak-data"),
    logFile: path.resolve(process.cwd(), "artifacts", "soak-summary.log")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--duration-ms" && next) {
      options.durationMs = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--interval-ms" && next) {
      options.intervalMs = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--port" && next) {
      options.port = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--data-dir" && next) {
      options.dataDir = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--log-file" && next) {
      options.logFile = path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return options;
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function callJson(baseUrl, pathname, method, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? `Request failed: ${response.status}`);
  }

  return result;
}

function createCycleIds(cycleNumber) {
  const stamp = `${Date.now()}-${cycleNumber}`;

  return {
    projectId: `soak-project-${stamp}`,
    recordId: `soak-record-${stamp}`,
    itemId: `soak-item-${stamp}`
  };
}

async function runCycle(baseUrl, cycleNumber) {
  const ids = createCycleIds(cycleNumber);

  await callJson(baseUrl, "/api/workspace/init", "POST", {
    project: {
      id: ids.projectId,
      name: `Soak Project ${cycleNumber}`,
      siteName: "Soak Site"
    },
    units: [
      {
        id: "unit-baseline",
        projectId: ids.projectId,
        name: "101",
        kind: "baseline"
      },
      {
        id: "unit-comparison",
        projectId: ids.projectId,
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

  await callJson(baseUrl, "/api/record/start", "POST", {
    id: ids.recordId,
    projectId: ids.projectId,
    baselineUnitId: "unit-baseline",
    comparisonUnitId: "unit-comparison",
    baselineVersion: "baseline-v1"
  });

  await callJson(baseUrl, "/api/record/add-item", "POST", {
    recordId: ids.recordId,
    item: {
      id: ids.itemId,
      checkpointId: "cp-1",
      resultType: "missing",
      reviewRequired: cycleNumber % 2 === 0,
      note: `Soak finding ${cycleNumber}`
    }
  });

  await callJson(baseUrl, "/api/record/send-review", "POST", {
    recordId: ids.recordId
  });

  await callJson(baseUrl, "/api/record/finalize", "POST", {
    recordId: ids.recordId
  });

  const report = await callJson(baseUrl, "/api/report/generate", "POST", {
    recordId: ids.recordId
  });

  const backup = await callJson(baseUrl, "/api/backup/export", "POST", {
    projectId: ids.projectId
  });

  await callJson(
    baseUrl,
    `/api/backup/show?backupId=${encodeURIComponent(backup.backupId)}`,
    "GET"
  );

  return {
    cycleNumber,
    projectId: ids.projectId,
    recordId: ids.recordId,
    reportId: report.report.id,
    backupId: backup.backupId
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(path.dirname(options.logFile), { recursive: true });
  await mkdir(options.dataDir, { recursive: true });

  const server = createBaseMarkServer({
    dataDir: options.dataDir
  });

  await new Promise((resolve) => server.listen(options.port, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const startedAt = new Date().toISOString();
  const endTime = Date.now() + options.durationMs;
  let cycleNumber = 0;
  let successCount = 0;
  let failureCount = 0;
  const lines = [
    `startedAt=${startedAt}`,
    `baseUrl=${baseUrl}`,
    `dataDir=${options.dataDir}`,
    `durationMs=${options.durationMs}`,
    `intervalMs=${options.intervalMs}`
  ];

  process.stdout.write(`[soak] started ${startedAt} ${baseUrl}\n`);

  try {
    while (Date.now() < endTime) {
      cycleNumber += 1;
      const cycleStartedAt = new Date().toISOString();

      try {
        const result = await runCycle(baseUrl, cycleNumber);
        successCount += 1;
        const line = `[${cycleStartedAt}] cycle=${cycleNumber} status=ok project=${result.projectId} record=${result.recordId} report=${result.reportId} backup=${result.backupId}`;
        lines.push(line);
        process.stdout.write(`${line}\n`);
      } catch (error) {
        failureCount += 1;
        const line = `[${cycleStartedAt}] cycle=${cycleNumber} status=error message=${error.message}`;
        lines.push(line);
        process.stderr.write(`${line}\n`);
      }

      if (Date.now() < endTime) {
        await sleep(options.intervalMs);
      }
    }
  } finally {
    const finishedAt = new Date().toISOString();
    lines.push(`finishedAt=${finishedAt}`);
    lines.push(`successCount=${successCount}`);
    lines.push(`failureCount=${failureCount}`);
    await writeFile(options.logFile, `${lines.join("\n")}\n`, "utf8");
    await new Promise((resolve) => server.close(resolve));
    process.stdout.write(`[soak] finished ${finishedAt} success=${successCount} failure=${failureCount}\n`);
  }
}

await main();
