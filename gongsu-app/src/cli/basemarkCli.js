import { readFile } from "node:fs/promises";
import path from "node:path";

import { BaseMarkService } from "../app/baseMarkService.js";
import { BaseMarkRepository } from "../storage/basemarkRepository.js";
import { LocalStore } from "../storage/localStore.js";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}.`);
    }

    const key = token.slice(2);
    const value = rest[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }

    options[key] = value;
    index += 1;
  }

  return {
    command,
    options
  };
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function createService(dataDir, exportDir) {
  const store = new LocalStore({
    rootDir: dataDir ?? path.resolve(process.cwd(), "data")
  });
  const repository = new BaseMarkRepository({ store });

  return new BaseMarkService({
    repository,
    exportDir: exportDir ?? path.resolve(store.rootDir, "..", "exports")
  });
}

function writeJsonLine(output, value) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function executeCommand(command, options, io) {
  const service = createService(options["data-dir"], options["export-dir"]);

  switch (command) {
    case "workspace:init": {
      if (!options.input) {
        throw new Error("workspace:init requires --input.");
      }

      const input = await readJsonFile(options.input);
      return service.createProjectWorkspace(input);
    }
    case "workspace:show": {
      if (!options["project-id"]) {
        throw new Error("workspace:show requires --project-id.");
      }

      return service.loadProjectWorkspace(options["project-id"]);
    }
    case "record:start": {
      if (!options.input) {
        throw new Error("record:start requires --input.");
      }

      const input = await readJsonFile(options.input);
      return service.startInspectionRecord(input);
    }
    case "record:add-item": {
      if (!options.input) {
        throw new Error("record:add-item requires --input.");
      }

      const input = await readJsonFile(options.input);
      return service.appendInspectionItem(input);
    }
    case "record:send-review": {
      if (!options["record-id"]) {
        throw new Error("record:send-review requires --record-id.");
      }

      return service.sendInspectionRecordToReview(options["record-id"]);
    }
    case "record:reopen": {
      if (!options["record-id"]) {
        throw new Error("record:reopen requires --record-id.");
      }

      return service.reopenInspectionRecord(options["record-id"]);
    }
    case "record:finalize": {
      if (!options["record-id"]) {
        throw new Error("record:finalize requires --record-id.");
      }

      return service.finalizeInspectionRecord(options["record-id"]);
    }
    case "record:show": {
      if (!options["record-id"]) {
        throw new Error("record:show requires --record-id.");
      }

      return service.repository.readInspectionRecord(options["record-id"]);
    }
    case "report:generate": {
      if (!options["record-id"]) {
        throw new Error("report:generate requires --record-id.");
      }

      return service.generateInspectionReport(options["record-id"]);
    }
    case "report:list": {
      return service.listReports(options["project-id"]);
    }
    case "report:show": {
      if (!options["report-id"]) {
        throw new Error("report:show requires --report-id.");
      }

      return service.repository.readReport(options["report-id"]);
    }
    case "backup:export": {
      if (!options["project-id"]) {
        throw new Error("backup:export requires --project-id.");
      }

      return service.exportProjectBackup(options["project-id"]);
    }
    case "backup:list":
      return service.listBackupPackages();
    case "backup:show": {
      if (!options["backup-id"]) {
        throw new Error("backup:show requires --backup-id.");
      }

      return service.inspectBackupPackage(options["backup-id"]);
    }
    case "backup:restore": {
      if (!options["backup-id"]) {
        throw new Error("backup:restore requires --backup-id.");
      }

      return service.restoreBackupPackage(options["backup-id"]);
    }
    default:
      io.stderr.write(
        "Available commands: workspace:init, workspace:show, record:start, record:add-item, record:send-review, record:reopen, record:finalize, record:show, report:generate, report:list, report:show, backup:export, backup:list, backup:show, backup:restore\n"
      );
      throw new Error(`Unknown command: ${command ?? "(missing)"}.`);
  }
}

export async function runCli(argv, io = process) {
  try {
    const { command, options } = parseArgs(argv);
    const result = await executeCommand(command, options, io);

    writeJsonLine(io.stdout, result);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
