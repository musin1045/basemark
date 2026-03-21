function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createEngineScenario(input) {
  assertObject(input, "engineScenario");
  assertNonEmptyString(input.id, "engineScenario.id");
  assertNonEmptyString(input.name, "engineScenario.name");
  assertObject(input.scenario, "engineScenario.scenario");

  return {
    id: input.id,
    name: input.name,
    description: input.description ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    scenario: clone(input.scenario)
  };
}

export class EngineScenarioRepository {
  constructor(options = {}) {
    if (!options.store) {
      throw new Error("EngineScenarioRepository requires a store.");
    }

    this.store = options.store;
  }

  getScenarioPath(scenarioId) {
    assertNonEmptyString(scenarioId, "scenarioId");
    return `engine-scenarios/${scenarioId}.json`;
  }

  async saveScenario(input) {
    const payload = createEngineScenario(input);
    await this.store.writeDocument(this.getScenarioPath(payload.id), payload);
    return payload;
  }

  async readScenario(scenarioId) {
    const document = await this.store.readDocument(this.getScenarioPath(scenarioId));
    return createEngineScenario(document.payload);
  }

  async listScenarios() {
    const fileNames = await this.store.listDocuments("engine-scenarios");
    const scenarios = await Promise.all(
      fileNames.map(async (fileName) => {
        const document = await this.store.readDocument(fileName);
        return createEngineScenario(document.payload);
      })
    );

    return scenarios.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}
