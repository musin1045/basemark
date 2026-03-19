const STORAGE_KEY = "basemark.engine.scenario.v1";

const defaultScenario = {
  segment: {
    segmentId: "segment-door-left-wall",
    segmentKind: "wall_strip",
    label: "Door-left wall segment"
  },
  anchors: [
    {
      anchorId: "anchor-left",
      segmentId: "segment-door-left-wall",
      anchorKind: "door_frame_edge",
      geometryType: "point",
      drawingReference: { point: { x: 0, y: 0 } },
      fieldObservation: { point: { x: 100, y: 120 } },
      stabilityScore: 0.96,
      visibilityState: "visible"
    },
    {
      anchorId: "anchor-right",
      segmentId: "segment-door-left-wall",
      anchorKind: "wall_corner",
      geometryType: "point",
      drawingReference: { point: { x: 1, y: 0 } },
      fieldObservation: { point: { x: 300, y: 120 } },
      stabilityScore: 0.92,
      visibilityState: "visible"
    }
  ],
  checkpoints: [
    {
      checkpointId: "checkpoint-switch",
      segmentId: "segment-door-left-wall",
      anchorBasis: ["anchor-left", "anchor-right"],
      coordinateModel: "span_ratio_plus_height_ratio",
      normalizedPosition: {
        spanRatio: 0.5,
        heightRatio: -0.1
      },
      allowedTolerance: {
        positionSpanRatio: 0.05,
        searchSpanRatio: 0.2
      },
      semanticExpectation: "switch_box"
    }
  ],
  fieldEvidence: {
    evidenceId: "evidence-1",
    segmentId: "segment-door-left-wall",
    imageRef: "fixtures/door-left-wall.jpg"
  },
  observedElements: []
};

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function parseScenario() {
  return JSON.parse(document.querySelector("#engine-scenario-input").value);
}

function saveScenario() {
  localStorage.setItem(
    STORAGE_KEY,
    document.querySelector("#engine-scenario-input").value
  );
}

function loadScenario() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ?? stringify(defaultScenario);
}

function setFlash(message, isError = false) {
  const banner = document.querySelector("#flash-banner");
  banner.textContent = message;
  banner.classList.remove("is-hidden");
  banner.style.background = isError
    ? "rgba(176, 70, 55, 0.14)"
    : "rgba(43, 96, 125, 0.12)";
  banner.style.borderColor = isError
    ? "rgba(176, 70, 55, 0.25)"
    : "rgba(43, 96, 125, 0.22)";
}

function renderMetrics(result = null) {
  const scenario = parseScenario();
  document.querySelector("#metric-anchor-count").textContent = String(
    scenario.anchors.length
  );
  document.querySelector("#metric-checkpoint-count").textContent = String(
    scenario.checkpoints.length
  );
  document.querySelector("#metric-observed-count").textContent = String(
    scenario.observedElements.length
  );
  document.querySelector("#metric-candidate-count").textContent = String(
    result?.candidates?.length ?? 0
  );
  document.querySelector("#scenario-name").textContent =
    scenario.segment.label ?? scenario.segment.segmentId;
}

function renderSummary(result) {
  const root = document.querySelector("#engine-summary");
  root.innerHTML = "";

  const blocks = [
    `Segment: ${result.segmentId}`,
    `Anchors: ${result.activeAnchors.map((anchor) => anchor.anchorId).join(", ")}`,
    `Alignment: ${result.alignmentModel}`,
    `Quality: ${result.alignmentQuality.status} (${result.alignmentQuality.score.toFixed(2)})`,
    `Projected checkpoints: ${result.projectedCheckpoints.length}`,
    `Candidates: ${result.candidates.length}`
  ];

  for (const text of blocks) {
    const p = document.createElement("p");
    p.textContent = text;
    root.appendChild(p);
  }
}

function renderCandidates(result) {
  const root = document.querySelector("#candidate-cards");
  root.innerHTML = "";

  if (!result.candidates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No candidates generated for the current scenario.";
    root.appendChild(empty);
    return;
  }

  for (const candidate of result.candidates) {
    const article = document.createElement("article");
    article.className = "candidate-card";
    article.dataset.type = candidate.candidateType;
    article.innerHTML = `
      <div class="finding-topline">
        <strong>${candidate.candidateType}</strong>
        <span class="tag">${candidate.reasonCode}</span>
      </div>
      <p>checkpoint: ${candidate.checkpointId ?? "none"}</p>
      <p>anchors: ${candidate.activeAnchors.join(", ")}</p>
      <p>review: ${candidate.reviewHint}</p>
    `;
    root.appendChild(article);
  }
}

function renderOutput(result) {
  document.querySelector("#output").textContent = stringify(result);
}

function setScreen(screenName) {
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("is-active", screen.dataset.screen === screenName);
  }

  for (const button of document.querySelectorAll(".nav-button")) {
    button.classList.toggle(
      "is-active",
      button.dataset.screenTarget === screenName
    );
  }

  document.querySelector("#screen-title").textContent =
    screenName === "engine" ? "Engine" : screenName === "workspace" ? "Ops" : "Home";
}

function applyScenario(value) {
  document.querySelector("#engine-scenario-input").value = stringify(value);
  saveScenario();
  renderMetrics();
}

function createMissingExample() {
  return {
    ...defaultScenario,
    observedElements: []
  };
}

function createPositionExample() {
  return {
    ...defaultScenario,
    observedElements: [
      {
        elementId: "observed-switch-1",
        segmentId: "segment-door-left-wall",
        elementKind: "switch_box",
        point: { x: 225, y: 100 }
      }
    ]
  };
}

function createExtraExample() {
  return {
    ...defaultScenario,
    observedElements: [
      {
        elementId: "observed-switch-1",
        segmentId: "segment-door-left-wall",
        elementKind: "switch_box",
        point: { x: 202, y: 101 }
      },
      {
        elementId: "observed-extra-1",
        segmentId: "segment-door-left-wall",
        elementKind: "outlet_box",
        point: { x: 260, y: 95 }
      }
    ]
  };
}

async function runEngine() {
  try {
    const scenario = parseScenario();
    saveScenario();
    const response = await fetch("/api/engine/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stringify(scenario)
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "Engine run failed.");
    }

    renderMetrics(result);
    renderSummary(result);
    renderCandidates(result);
    renderOutput(result);
    document.querySelector("#engine-status").textContent = "Ready";
    document.querySelector("#engine-status-detail").textContent =
      `${result.candidates.length} candidates from ${result.segmentId}`;
    setFlash("Engine run completed.");
  } catch (error) {
    document.querySelector("#engine-status").textContent = "Error";
    document.querySelector("#engine-status-detail").textContent = error.message;
    setFlash(error.message, true);
  }
}

function bindEvents() {
  for (const button of document.querySelectorAll("[data-screen-target]")) {
    button.addEventListener("click", () => {
      setScreen(button.dataset.screenTarget);
    });
  }

  document
    .querySelector("#engine-scenario-input")
    .addEventListener("input", () => {
      saveScenario();
      try {
        renderMetrics();
      } catch {
        document.querySelector("#engine-status").textContent = "Draft";
        document.querySelector("#engine-status-detail").textContent =
          "Scenario JSON needs formatting.";
      }
    });

  for (const button of document.querySelectorAll("[data-action='run-engine']")) {
    button.addEventListener("click", runEngine);
  }

  document
    .querySelector("[data-action='reset-scenario']")
    .addEventListener("click", () => {
      applyScenario(defaultScenario);
      setFlash("Scenario reset to default.");
    });

  document
    .querySelector("[data-action='format-scenario']")
    .addEventListener("click", () => {
      applyScenario(parseScenario());
      setFlash("Scenario JSON formatted.");
    });

  document
    .querySelector("[data-action='load-missing-example']")
    .addEventListener("click", () => {
      applyScenario(createMissingExample());
      setFlash("Missing example loaded.");
    });

  document
    .querySelector("[data-action='load-position-example']")
    .addEventListener("click", () => {
      applyScenario(createPositionExample());
      setFlash("Position-diff example loaded.");
    });

  document
    .querySelector("[data-action='load-extra-example']")
    .addEventListener("click", () => {
      applyScenario(createExtraExample());
      setFlash("Extra example loaded.");
    });

  document
    .querySelector("[data-action='clear-output']")
    .addEventListener("click", () => {
      document.querySelector("#output").textContent = "No output yet.";
      document.querySelector("#candidate-cards").innerHTML =
        '<p class="empty-state">No candidate output yet.</p>';
      document.querySelector("#engine-summary").innerHTML =
        "<p>Run the engine to inspect alignment and candidate output.</p>";
      document.querySelector("#metric-candidate-count").textContent = "0";
      setFlash("Engine output cleared.");
    });
}

function init() {
  document.querySelector("#engine-scenario-input").value = loadScenario();
  renderMetrics();
  bindEvents();
}

init();
