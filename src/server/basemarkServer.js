import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BaseMarkService } from "../app/baseMarkService.js";
import { generateComparisonCandidates } from "../engine/baseMarkEngine.js";
import { extractDrawingStructureFromSvg } from "../engine/drawingStructureExtractor.js";
import { suggestPhotoAnchorsFromImageData } from "../engine/photoAnchorSuggester.js";
import { ReviewRepository } from "../engine/reviewRepository.js";
import { EngineScenarioRepository } from "../engine/scenarioRepository.js";
import { BaseMarkRepository } from "../storage/basemarkRepository.js";
import { LocalStore } from "../storage/localStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, "../ui");
const KONVA_VENDOR_PATH = path.resolve(process.cwd(), "node_modules/konva/konva.min.js");
const UI_ENGINE_DIR = path.resolve(UI_DIR, "engine");

function createRuntime(dataDir) {
  const store = new LocalStore({ rootDir: dataDir });
  const repository = new BaseMarkRepository({ store });
  const engineScenarioRepository = new EngineScenarioRepository({ store });
  const reviewRepository = new ReviewRepository({ store });

  return {
    service: new BaseMarkService({ repository }),
    engineScenarioRepository,
    reviewRepository
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(payload);
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(response, fileName, contentType) {
  const filePath = path.join(UI_DIR, fileName);
  const source = await readFile(filePath, "utf8");

  response.writeHead(200, { "content-type": contentType });
  response.end(source);
}

async function handleApi(request, response, runtime, url) {
  const { service, engineScenarioRepository, reviewRepository } = runtime;

  if (request.method === "GET" && url.pathname === "/api/projects") {
    return sendJson(response, 200, await service.listProjects());
  }

  if (request.method === "GET" && url.pathname === "/api/backups") {
    return sendJson(response, 200, await service.listBackupPackages());
  }

  if (request.method === "POST" && url.pathname === "/api/workspace/init") {
    return sendJson(response, 200, await service.createProjectWorkspace(await readBody(request)));
  }

  if (request.method === "GET" && url.pathname === "/api/workspace/show") {
    const projectId = url.searchParams.get("projectId");
    return sendJson(response, 200, await service.loadProjectWorkspace(projectId));
  }

  if (request.method === "POST" && url.pathname === "/api/record/start") {
    return sendJson(response, 200, await service.startInspectionRecord(await readBody(request)));
  }

  if (request.method === "GET" && url.pathname === "/api/records") {
    const projectId = url.searchParams.get("projectId");
    return sendJson(response, 200, await service.listInspectionRecords(projectId));
  }

  if (request.method === "GET" && url.pathname === "/api/reports") {
    const projectId = url.searchParams.get("projectId");
    return sendJson(response, 200, await service.listReports(projectId));
  }

  if (request.method === "POST" && url.pathname === "/api/record/add-item") {
    return sendJson(response, 200, await service.appendInspectionItem(await readBody(request)));
  }

  if (request.method === "POST" && url.pathname === "/api/record/send-review") {
    const payload = await readBody(request);
    return sendJson(response, 200, await service.sendInspectionRecordToReview(payload.recordId));
  }

  if (request.method === "POST" && url.pathname === "/api/record/reopen") {
    const payload = await readBody(request);
    return sendJson(response, 200, await service.reopenInspectionRecord(payload.recordId));
  }

  if (request.method === "POST" && url.pathname === "/api/record/finalize") {
    const payload = await readBody(request);
    return sendJson(response, 200, await service.finalizeInspectionRecord(payload.recordId));
  }

  if (request.method === "GET" && url.pathname === "/api/record/show") {
    const recordId = url.searchParams.get("recordId");
    return sendJson(response, 200, await service.repository.readInspectionRecord(recordId));
  }

  if (request.method === "POST" && url.pathname === "/api/report/generate") {
    const payload = await readBody(request);
    return sendJson(response, 200, await service.generateInspectionReport(payload.recordId));
  }

  if (request.method === "GET" && url.pathname === "/api/report/show") {
    const reportId = url.searchParams.get("reportId");
    return sendJson(response, 200, await service.getReportDetails(reportId));
  }

  if (request.method === "POST" && url.pathname === "/api/backup/export") {
    const payload = await readBody(request);
    return sendJson(response, 200, await service.exportProjectBackup(payload.projectId));
  }

  if (request.method === "GET" && url.pathname === "/api/backup/show") {
    const backupId = url.searchParams.get("backupId");
    return sendJson(response, 200, await service.inspectBackupPackage(backupId));
  }

  if (request.method === "POST" && url.pathname === "/api/backup/restore") {
    const payload = await readBody(request);
    return sendJson(response, 200, await service.restoreBackupPackage(payload.backupId));
  }

  if (request.method === "POST" && url.pathname === "/api/engine/run") {
    return sendJson(
      response,
      200,
      generateComparisonCandidates(await readBody(request))
    );
  }

  if (request.method === "POST" && url.pathname === "/api/engine/drawing/extract") {
    const payload = await readBody(request);

    if (payload.format !== "svg") {
      throw new Error("Only svg drawing extraction is supported in this slice.");
    }

    return sendJson(
      response,
      200,
      extractDrawingStructureFromSvg(payload.source, {
        cornerTolerance: payload.cornerTolerance
      })
    );
  }

  if (request.method === "POST" && url.pathname === "/api/engine/photo/suggest-anchors") {
    const payload = await readBody(request);

    return sendJson(
      response,
      200,
      suggestPhotoAnchorsFromImageData(
        {
          width: payload.imageData?.width,
          height: payload.imageData?.height,
          data: new Uint8ClampedArray(payload.imageData?.data ?? [])
        },
        {
          step: payload.options?.step,
          margin: payload.options?.margin,
          minimumConfidence: payload.options?.minimumConfidence
        }
      )
    );
  }

  if (request.method === "GET" && url.pathname === "/api/engine/scenarios") {
    return sendJson(response, 200, await engineScenarioRepository.listScenarios());
  }

  if (request.method === "GET" && url.pathname === "/api/engine/scenario/show") {
    const scenarioId = url.searchParams.get("scenarioId");
    return sendJson(response, 200, await engineScenarioRepository.readScenario(scenarioId));
  }

  if (request.method === "POST" && url.pathname === "/api/engine/scenario/save") {
    return sendJson(
      response,
      200,
      await engineScenarioRepository.saveScenario(await readBody(request))
    );
  }

  if (request.method === "GET" && url.pathname === "/api/engine/review/show") {
    const scenarioId = url.searchParams.get("scenarioId");
    return sendJson(response, 200, await reviewRepository.readSession(scenarioId));
  }

  if (request.method === "POST" && url.pathname === "/api/engine/review/save") {
    return sendJson(
      response,
      200,
      await reviewRepository.saveReview(await readBody(request))
    );
  }

  return false;
}

export function createBaseMarkServer(options = {}) {
  const dataDir = options.dataDir ?? path.resolve(process.cwd(), "data");
  const runtime = createRuntime(dataDir);

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    try {
      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi(request, response, runtime, url);

        if (handled === false) {
          sendJson(response, 404, { error: `Unknown API route: ${url.pathname}` });
        }

        return;
      }

      if (request.method === "GET" && url.pathname === "/") {
        await serveStatic(response, "index.html", "text/html; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/app.js") {
        await serveStatic(response, "app.js", "application/javascript; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/styles.css") {
        await serveStatic(response, "styles.css", "text/css; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/engine/")) {
        const fileName = url.pathname.replace("/engine/", "");
        const source = await readFile(path.join(UI_ENGINE_DIR, fileName), "utf8");
        response.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8"
        });
        response.end(source);
        return;
      }

      if (request.method === "GET" && url.pathname === "/vendor/konva.min.js") {
        const source = await readFile(KONVA_VENDOR_PATH, "utf8");
        response.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8"
        });
        response.end(source);
        return;
      }

      sendText(response, 404, "Not found");
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

export async function startBaseMarkServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const server = createBaseMarkServer(options);

  await new Promise((resolve) => {
    server.listen(port, host, resolve);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = process.argv[2] ?? path.resolve(process.cwd(), "data");
  const port = Number(process.argv[3] ?? "3000");
  const server = await startBaseMarkServer({ dataDir, port });
  const address = server.address();
  process.stdout.write(
    `BaseMark local shell running at http://127.0.0.1:${address.port}\n`
  );
}
