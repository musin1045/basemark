import { generateComparisonCandidates } from "./engine/baseMarkEngine.js";

const STORAGE_KEY = "basemark.engine.scenario.v1";
const SCENARIO_LIBRARY_KEY = "basemark.engine.scenario.library.v1";
const REVIEW_LIBRARY_KEY = "basemark.engine.review.library.v1";
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 520;

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

let stage = null;
let lastRunResult = null;
let currentReviewSession = {
  scenarioId: "door-left-wall",
  reviews: []
};
let selectedCandidateId = null;
let cameraStream = null;

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function cloneScenario(scenario) {
  return JSON.parse(JSON.stringify(scenario));
}

function parseScenario() {
  return JSON.parse(document.querySelector("#engine-scenario-input").value);
}

function getScenarioMetadata() {
  return {
    id: document.querySelector("#scenario-id-input").value.trim(),
    name: document.querySelector("#scenario-title-input").value.trim(),
    description: document.querySelector("#scenario-description-input").value.trim()
  };
}

function saveScenario() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      metadata: getScenarioMetadata(),
      scenarioText: document.querySelector("#engine-scenario-input").value
    })
  );
}

function loadScenario() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return {
      metadata: {
        id: "door-left-wall",
        name: "Door Left Wall",
        description: "Default local segment for engine iteration."
      },
      scenarioText: stringify(defaultScenario)
    };
  }

  const parsed = JSON.parse(saved);
  return {
    metadata: parsed.metadata,
    scenarioText: parsed.scenarioText
  };
}

function writeScenarioToEditor(scenario) {
  document.querySelector("#engine-scenario-input").value = stringify(scenario);
}

function isLocalShellMode() {
  return window.location.protocol === "capacitor:" || window.location.protocol === "file:";
}

function readLibrary(key, fallback = []) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function writeLibrary(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setFlash(message, isError = false) {
  const banner = document.querySelector("#flash-banner");
  banner.textContent = message;
  banner.classList.remove("is-hidden");
  banner.style.background = isError
    ? "rgba(176, 70, 55, 0.14)"
    : "rgba(46, 102, 135, 0.12)";
  banner.style.borderColor = isError
    ? "rgba(176, 70, 55, 0.25)"
    : "rgba(46, 102, 135, 0.22)";
}

function clearFlash() {
  document.querySelector("#flash-banner").classList.add("is-hidden");
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
    getScenarioMetadata().name || scenario.segment.label || scenario.segment.segmentId;
  document.querySelector("#scenario-detail").textContent =
    scenario.segment.label || "Editable local draft";
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

function updateScenario(mutator) {
  const nextScenario = cloneScenario(parseScenario());
  mutator(nextScenario);
  writeScenarioToEditor(nextScenario);
  saveScenario();
  renderMetrics();
  renderFormBuilder();
  renderCanvas({ scenario: nextScenario, result: null });
  lastRunResult = null;
  return nextScenario;
}

function createLabeledInput(label, value, onInput, type = "text", step = null) {
  const wrapper = document.createElement("label");
  wrapper.className = "builder-field";

  const heading = document.createElement("span");
  heading.className = "builder-label";
  heading.textContent = label;
  wrapper.appendChild(heading);

  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  if (step !== null) {
    input.step = step;
  }
  input.addEventListener("input", onInput);
  wrapper.appendChild(input);

  return wrapper;
}

function createLabeledSelect(label, value, options, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "builder-field";

  const heading = document.createElement("span");
  heading.className = "builder-label";
  heading.textContent = label;
  wrapper.appendChild(heading);

  const select = document.createElement("select");
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  }
  select.value = value ?? options[0]?.value ?? "";
  select.addEventListener("input", onInput);
  wrapper.appendChild(select);

  return wrapper;
}

function readScenarioFromForm() {
  const current = parseScenario();
  return {
    ...current,
    segment: {
      ...current.segment,
      segmentId: document.querySelector("#form-segment-id").value.trim(),
      segmentKind: document.querySelector("#form-segment-kind").value.trim(),
      label: document.querySelector("#form-segment-label").value.trim()
    }
  };
}

function syncSegmentFormToEditor() {
  const scenario = readScenarioFromForm();
  writeScenarioToEditor(scenario);
  saveScenario();
  renderMetrics();
  renderFormBuilder();
  renderScenarioValidation(scenario);
  renderSelectedCandidateDetail(null);
  renderCanvas({ scenario, result: null });
  lastRunResult = null;
}

function renderFormBuilder() {
  const scenario = parseScenario();

  document.querySelector("#form-segment-id").value = scenario.segment.segmentId ?? "";
  document.querySelector("#form-segment-kind").value =
    scenario.segment.segmentKind ?? "";
  document.querySelector("#form-segment-label").value = scenario.segment.label ?? "";

  const anchorRoot = document.querySelector("#anchor-form-list");
  anchorRoot.innerHTML = "";
  scenario.anchors.forEach((anchor, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.innerHTML = `
      <h5>앵커 ${index + 1}</h5>
      <p class="form-card-copy">비교 기준 프레임을 만드는 구조 기준점입니다.</p>
      <div class="builder-grid builder-grid-two"></div>
      <div class="form-card-actions"><button type="button">삭제</button></div>
    `;
    const grid = card.querySelector(".builder-grid");
    grid.appendChild(
      createLabeledInput("앵커 ID", anchor.anchorId, (event) => {
        updateScenario((draft) => {
          draft.anchors[index].anchorId = event.target.value;
        });
      })
    );
    grid.appendChild(
      createLabeledInput("구조 종류", anchor.anchorKind, (event) => {
        updateScenario((draft) => {
          draft.anchors[index].anchorKind = event.target.value;
        });
      })
    );
    grid.appendChild(
      createLabeledInput("현장 X", anchor.fieldObservation.point.x, (event) => {
        updateScenario((draft) => {
          draft.anchors[index].fieldObservation.point.x = Number(event.target.value || 0);
        });
      }, "number", "0.1")
    );
    grid.appendChild(
      createLabeledInput("현장 Y", anchor.fieldObservation.point.y, (event) => {
        updateScenario((draft) => {
          draft.anchors[index].fieldObservation.point.y = Number(event.target.value || 0);
        });
      }, "number", "0.1")
    );
    grid.appendChild(
      createLabeledInput("안정성", anchor.stabilityScore, (event) => {
        updateScenario((draft) => {
          draft.anchors[index].stabilityScore = Number(event.target.value || 0);
        });
      }, "number", "0.01")
    );
    grid.appendChild(
      createLabeledSelect(
        "가시 상태",
        anchor.visibilityState,
        [
          { value: "visible", label: "visible" },
          { value: "partial", label: "partial" },
          { value: "hidden", label: "hidden" }
        ],
        (event) => {
          updateScenario((draft) => {
            draft.anchors[index].visibilityState = event.target.value;
          });
        }
      )
    );
    card.querySelector("button").addEventListener("click", () => {
      updateScenario((draft) => {
        draft.anchors.splice(index, 1);
        for (const checkpoint of draft.checkpoints) {
          checkpoint.anchorBasis = checkpoint.anchorBasis.filter(
            (anchorId) => anchorId !== anchor.anchorId
          );
        }
      });
      setFlash(`앵커 ${anchor.anchorId}를 삭제했습니다.`);
    });
    anchorRoot.appendChild(card);
  });

  const checkpointRoot = document.querySelector("#checkpoint-form-list");
  checkpointRoot.innerHTML = "";
  scenario.checkpoints.forEach((checkpoint, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.innerHTML = `
      <h5>체크포인트 ${index + 1}</h5>
      <p class="form-card-copy">앵커 기준 상대 좌표로 정의되는 예상 위치입니다.</p>
      <div class="builder-grid builder-grid-two"></div>
      <p class="form-card-copy form-card-copy-secondary"></p>
      <div class="form-card-actions"><button type="button">삭제</button></div>
    `;
    const grid = card.querySelector(".builder-grid");
    grid.appendChild(
      createLabeledInput("체크포인트 ID", checkpoint.checkpointId, (event) => {
        updateScenario((draft) => {
          draft.checkpoints[index].checkpointId = event.target.value;
        });
      })
    );
    grid.appendChild(
      createLabeledInput("기대 요소", checkpoint.semanticExpectation, (event) => {
        updateScenario((draft) => {
          draft.checkpoints[index].semanticExpectation = event.target.value;
        });
      })
    );
    grid.appendChild(
      createLabeledInput(
        "spanRatio",
        checkpoint.normalizedPosition.spanRatio,
        (event) => {
          updateScenario((draft) => {
            draft.checkpoints[index].normalizedPosition.spanRatio = Number(
              event.target.value || 0
            );
          });
        },
        "number",
        "0.01"
      )
    );
    grid.appendChild(
      createLabeledInput(
        "heightRatio",
        checkpoint.normalizedPosition.heightRatio,
        (event) => {
          updateScenario((draft) => {
            draft.checkpoints[index].normalizedPosition.heightRatio = Number(
              event.target.value || 0
            );
          });
        },
        "number",
        "0.01"
      )
    );
    grid.appendChild(
      createLabeledInput(
        "허용 편차",
        checkpoint.allowedTolerance.positionSpanRatio,
        (event) => {
          updateScenario((draft) => {
            draft.checkpoints[index].allowedTolerance.positionSpanRatio = Number(
              event.target.value || 0
            );
          });
        },
        "number",
        "0.01"
      )
    );
    grid.appendChild(
      createLabeledInput(
        "탐색 범위",
        checkpoint.allowedTolerance.searchSpanRatio,
        (event) => {
          updateScenario((draft) => {
            draft.checkpoints[index].allowedTolerance.searchSpanRatio = Number(
              event.target.value || 0
            );
          });
        },
        "number",
        "0.01"
      )
    );
    card.querySelector(".form-card-copy-secondary").textContent =
      `기준 앵커: ${checkpoint.anchorBasis.join(", ") || "없음"}`;
    card.querySelector("button").addEventListener("click", () => {
      updateScenario((draft) => {
        draft.checkpoints.splice(index, 1);
      });
      setFlash(`체크포인트 ${checkpoint.checkpointId}를 삭제했습니다.`);
    });
    checkpointRoot.appendChild(card);
  });

  const observedRoot = document.querySelector("#observed-form-list");
  observedRoot.innerHTML = "";
  scenario.observedElements.forEach((element, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.innerHTML = `
      <h5>관측 요소 ${index + 1}</h5>
      <p class="form-card-copy">현장 장면에서 실제로 보이는 요소 위치입니다.</p>
      <div class="builder-grid builder-grid-two"></div>
      <div class="form-card-actions"><button type="button">삭제</button></div>
    `;
    const grid = card.querySelector(".builder-grid");
    grid.appendChild(
      createLabeledInput("요소 ID", element.elementId, (event) => {
        updateScenario((draft) => {
          draft.observedElements[index].elementId = event.target.value;
        });
      })
    );
    grid.appendChild(
      createLabeledInput("요소 종류", element.elementKind, (event) => {
        updateScenario((draft) => {
          draft.observedElements[index].elementKind = event.target.value;
        });
      })
    );
    grid.appendChild(
      createLabeledInput("현장 X", element.point.x, (event) => {
        updateScenario((draft) => {
          draft.observedElements[index].point.x = Number(event.target.value || 0);
        });
      }, "number", "0.1")
    );
    grid.appendChild(
      createLabeledInput("현장 Y", element.point.y, (event) => {
        updateScenario((draft) => {
          draft.observedElements[index].point.y = Number(event.target.value || 0);
        });
      }, "number", "0.1")
    );
    card.querySelector("button").addEventListener("click", () => {
      updateScenario((draft) => {
        draft.observedElements.splice(index, 1);
      });
      setFlash(`관측 요소 ${element.elementId}를 삭제했습니다.`);
    });
    observedRoot.appendChild(card);
  });
}

function renderSummary(result) {
  const root = document.querySelector("#engine-summary");
  root.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "summary-card-grid";

  const blocks = [
    {
      label: "구간",
      value: result.segmentId,
      detail: "현재 비교 중인 국소 구간입니다."
    },
    {
      label: "앵커",
      value: result.activeAnchors.map((anchor) => anchor.anchorId).join(", "),
      detail: "국소 기준 프레임 생성에 실제 사용된 구조 앵커입니다."
    },
    {
      label: "정합",
      value: result.alignmentModel,
      detail: `${result.alignmentQuality.status} / score ${result.alignmentQuality.score.toFixed(2)}`
    },
    {
      label: "결과",
      value: `${result.projectedCheckpoints.length} projected / ${result.candidates.length} candidates`,
      detail: "투영된 체크포인트 수와 후보 수입니다."
    }
  ];

  for (const block of blocks) {
    const article = document.createElement("article");
    article.className = "summary-card";
    article.innerHTML = `
      <span>${block.label}</span>
      <strong>${block.value}</strong>
      <p>${block.detail}</p>
    `;
    grid.appendChild(article);
  }

  root.appendChild(grid);
}

function renderProjectedCheckpoints(result) {
  const root = document.querySelector("#projected-checkpoints");
  root.innerHTML = "";

  if (!result.projectedCheckpoints.length) {
    root.innerHTML = "<p>아직 투영된 체크포인트가 없습니다.</p>";
    return;
  }

  for (const checkpoint of result.projectedCheckpoints) {
    const article = document.createElement("article");
    article.className = "checkpoint-card";
    article.innerHTML = `
      <strong>${checkpoint.checkpointId}</strong>
      <p>기대 요소: ${checkpoint.semanticExpectation}</p>
      <p>투영 좌표: (${checkpoint.projectedPoint.x}, ${checkpoint.projectedPoint.y})</p>
      <p>허용 반경: ${checkpoint.expectedNeighborhood.allowedRadius.toFixed(2)}</p>
      <p>탐색 반경: ${checkpoint.expectedNeighborhood.searchRadius.toFixed(2)}</p>
    `;
    root.appendChild(article);
  }
}

function renderCandidates(result) {
  const root = document.querySelector("#candidate-cards");
  root.innerHTML = "";

  if (!result.candidates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "현재 시나리오에서는 후보가 생성되지 않았습니다.";
    root.appendChild(empty);
    return;
  }

  for (const candidate of result.candidates) {
    const review = currentReviewSession.reviews.find(
      (entry) => entry.candidateId === candidate.candidateId
    ) ?? { status: "unreviewed", note: "" };
    const article = document.createElement("article");
    article.className = "candidate-card";
    article.dataset.type = candidate.candidateType;
    article.dataset.candidateId = candidate.candidateId;
    article.innerHTML = `
      <div class="finding-topline">
        <strong>${candidate.candidateType}</strong>
        <span class="tag">${candidate.reasonCode}</span>
      </div>
      <p>체크포인트: ${candidate.checkpointId ?? "none"}</p>
      <p>사용 앵커: ${candidate.activeAnchors.join(", ")}</p>
      <p>검토 힌트: ${candidate.reviewHint}</p>
      <p>증거 ID: ${candidate.evidenceRegion.evidenceId}</p>
      <div class="review-badge">상태: ${review.status}</div>
      <div class="review-actions">
        <button type="button" data-review-status="confirm">확정</button>
        <button type="button" data-review-status="reject">반려</button>
        <button type="button" data-review-status="hold">보류</button>
      </div>
      <label class="review-note">
        검토 메모
        <textarea>${review.note ?? ""}</textarea>
      </label>
    `;

    if (candidate.candidateId === selectedCandidateId) {
      article.classList.add("is-selected");
    }

    article.addEventListener("click", (event) => {
      if (event.target.closest("button, textarea")) {
        return;
      }
      focusCandidate(candidate.candidateId);
    });

    const noteField = article.querySelector("textarea");
    for (const button of article.querySelectorAll("[data-review-status]")) {
      button.addEventListener("click", async () => {
        await saveCandidateReview(
          candidate.candidateId,
          button.dataset.reviewStatus,
          noteField.value
        );
      });
    }

    root.appendChild(article);
  }
}

function renderReviewSummary(result) {
  const root = document.querySelector("#review-summary");
  root.innerHTML = "";

  if (!result.candidates.length) {
    root.innerHTML = "<p>아직 검토 요약이 없습니다.</p>";
    return;
  }

  const counts = {
    unreviewed: 0,
    confirm: 0,
    reject: 0,
    hold: 0
  };

  for (const candidate of result.candidates) {
    const review = currentReviewSession.reviews.find(
      (entry) => entry.candidateId === candidate.candidateId
    );
    counts[review?.status ?? "unreviewed"] += 1;
  }

  const grid = document.createElement("div");
  grid.className = "summary-card-grid";
  const items = [
    ["미검토", counts.unreviewed],
    ["확정", counts.confirm],
    ["반려", counts.reject],
    ["보류", counts.hold]
  ];

  for (const [label, value] of items) {
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <span>${label}</span>
      <strong>${value}</strong>
      <p>현재 후보 검토 수입니다.</p>
    `;
    grid.appendChild(card);
  }

  root.appendChild(grid);
}

function renderOutput(result) {
  document.querySelector("#output").textContent = stringify(result);
}

function validateScenarioDraft(scenario) {
  const issues = [];
  const segmentId = scenario.segment?.segmentId;
  const visibleAnchors = (scenario.anchors ?? []).filter(
    (anchor) => anchor.visibilityState === "visible"
  );
  const anchorIds = new Set((scenario.anchors ?? []).map((anchor) => anchor.anchorId));

  if (!segmentId) {
    issues.push({
      level: "error",
      message: "segment.segmentId is required."
    });
  }

  if (visibleAnchors.length < 2) {
    issues.push({
      level: "error",
      message: "At least two visible anchors are required."
    });
  }

  if ((scenario.fieldEvidence?.segmentId ?? "") !== segmentId) {
    issues.push({
      level: "error",
      message: "fieldEvidence.segmentId must match segment.segmentId."
    });
  }

  for (const checkpoint of scenario.checkpoints ?? []) {
    if (checkpoint.segmentId !== segmentId) {
      issues.push({
        level: "error",
        message: `Checkpoint ${checkpoint.checkpointId} is attached to a different segment.`
      });
    }

    if ((checkpoint.anchorBasis ?? []).length < 2) {
      issues.push({
        level: "warning",
        message: `Checkpoint ${checkpoint.checkpointId} should reference at least two anchors.`
      });
    }

    for (const anchorId of checkpoint.anchorBasis ?? []) {
      if (!anchorIds.has(anchorId)) {
        issues.push({
          level: "error",
          message: `Checkpoint ${checkpoint.checkpointId} references missing anchor ${anchorId}.`
        });
      }
    }
  }

  return issues;
}

function renderScenarioValidation(scenario) {
  const root = document.querySelector("#validation-summary");
  if (!root) {
    return;
  }

  root.innerHTML = "";
  const issues = validateScenarioDraft(scenario);

  if (!issues.length) {
    root.innerHTML =
      "<p>Validation passed. The current draft satisfies the minimum engine input rules.</p>";
    return;
  }

  for (const issue of issues) {
    const article = document.createElement("article");
    article.className = "summary-card";
    article.innerHTML = `
      <span>${issue.level}</span>
      <strong>${issue.message}</strong>
      <p>Resolve this before relying on engine output.</p>
    `;
    root.appendChild(article);
  }
}

function findSelectedCandidate(result) {
  return result?.candidates?.find(
    (candidate) => candidate.candidateId === selectedCandidateId
  ) ?? null;
}

function renderSelectedCandidateDetail(result) {
  const root = document.querySelector("#candidate-detail");
  if (!root) {
    return;
  }

  root.innerHTML = "";
  const candidate = findSelectedCandidate(result);

  if (!candidate) {
    root.innerHTML =
      "<p>Select a candidate card to inspect the evidence basis.</p>";
    return;
  }

  const review = currentReviewSession.reviews.find(
    (entry) => entry.candidateId === candidate.candidateId
  );
  const article = document.createElement("article");
  article.className = "checkpoint-card";
  article.innerHTML = `
    <strong>${candidate.candidateId}</strong>
    <p>Type: ${candidate.candidateType}</p>
    <p>Checkpoint: ${candidate.checkpointId ?? "none"}</p>
    <p>Reason: ${candidate.reasonCode}</p>
    <p>Evidence center: (${candidate.evidenceRegion.center.x}, ${candidate.evidenceRegion.center.y})</p>
    <p>Evidence radius: ${candidate.evidenceRegion.radius}</p>
    <p>Anchors: ${candidate.activeAnchors.join(", ")}</p>
    <p>Review status: ${review?.status ?? "unreviewed"}</p>
    <p>Review note: ${review?.note?.trim() || "none"}</p>
  `;
  root.appendChild(article);
}

function focusCandidate(candidateId) {
  selectedCandidateId = candidateId;

  for (const card of document.querySelectorAll(".candidate-card")) {
    card.classList.toggle("is-selected", card.dataset.candidateId === candidateId);
  }

  if (lastRunResult) {
    renderCanvas({ scenario: parseScenario(), result: lastRunResult });
    renderSelectedCandidateDetail(lastRunResult);
  }
}

function applyScenario(value) {
  writeScenarioToEditor(value);
  saveScenario();
  renderMetrics();
  renderFormBuilder();
  renderScenarioValidation(value);
  renderSelectedCandidateDetail(null);
  renderCanvas({ scenario: value, result: null });
  lastRunResult = null;
  selectedCandidateId = null;
}

function applySavedScenario(entry) {
  document.querySelector("#scenario-id-input").value = entry.id ?? "";
  document.querySelector("#scenario-title-input").value = entry.name ?? "";
  document.querySelector("#scenario-description-input").value =
    entry.description ?? "";
  writeScenarioToEditor(entry.scenario);
  saveScenario();
  renderMetrics();
  renderFormBuilder();
  renderScenarioValidation(entry.scenario);
  renderSelectedCandidateDetail(null);
  renderCanvas({ scenario: entry.scenario, result: null });
  lastRunResult = null;
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

function createStage() {
  const container = document.querySelector("#visual-canvas");
  container.innerHTML = "";
  const width = container.clientWidth || CANVAS_WIDTH;
  const height = container.clientHeight || CANVAS_HEIGHT;

  stage = new window.Konva.Stage({
    container: "visual-canvas",
    width,
    height
  });

  return stage;
}

function getBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function createProjector(points, width, height) {
  if (!points.length) {
    return {
      project: (point) => point,
      invert: (point) => point
    };
  }

  const bounds = getBounds(points);
  const dataWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const dataHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((width - 120) / dataWidth, (height - 120) / dataHeight);
  const offsetX = (width - dataWidth * scale) / 2;
  const offsetY = (height - dataHeight * scale) / 2;

  return {
    project(point) {
      return {
        x: offsetX + (point.x - bounds.minX) * scale,
        y: offsetY + (point.y - bounds.minY) * scale
      };
    },
    invert(point) {
      return {
        x: Number(((point.x - offsetX) / scale + bounds.minX).toFixed(2)),
        y: Number(((point.y - offsetY) / scale + bounds.minY).toFixed(2))
      };
    }
  };
}

function drawLabel(layer, text, point, fill) {
  const label = new window.Konva.Label({
    x: point.x + 10,
    y: point.y - 18,
    opacity: 0.94
  });
  label.add(
    new window.Konva.Tag({
      fill,
      cornerRadius: 999
    })
  );
  label.add(
    new window.Konva.Text({
      text,
      fontFamily: "Georgia",
      fontSize: 13,
      padding: 8,
      fill: "#fffaf0"
    })
  );
  layer.add(label);
}

async function startCamera() {
  const video = document.querySelector("#visual-video");
  const still = document.querySelector("#visual-still");

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API is not available in this browser.");
  }

  if (cameraStream) {
    return;
  }

  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" }
    },
    audio: false
  });

  video.srcObject = cameraStream;
  video.classList.remove("is-hidden");
  still.classList.add("is-hidden");
  await video.play();
}

function stopCamera() {
  const video = document.querySelector("#visual-video");

  if (cameraStream) {
    for (const track of cameraStream.getTracks()) {
      track.stop();
    }
  }

  cameraStream = null;
  video.pause();
  video.srcObject = null;
  video.classList.add("is-hidden");
}

function captureCameraFrame() {
  const video = document.querySelector("#visual-video");
  const still = document.querySelector("#visual-still");

  if (!cameraStream || video.readyState < 2) {
    throw new Error("Start the camera before capturing a frame.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  still.src = canvas.toDataURL("image/png");
  still.classList.remove("is-hidden");
}

function applyDraggedPoint(kind, index, point) {
  updateScenario((draft) => {
    if (kind === "anchor") {
      draft.anchors[index].fieldObservation.point = point;
    }
    if (kind === "observed") {
      draft.observedElements[index].point = point;
    }
  });
  setFlash(
    kind === "anchor"
      ? `앵커 좌표를 (${point.x}, ${point.y})로 옮겼습니다.`
      : `관측 요소 좌표를 (${point.x}, ${point.y})로 옮겼습니다.`
  );
}

function renderCanvas({ scenario, result }) {
  if (!window.Konva) {
    document.querySelector("#visual-caption").textContent =
      "Konva 로딩에 실패해서 시각 오버레이를 표시할 수 없습니다.";
    return;
  }

  const currentStage = stage ?? createStage();
  currentStage.destroyChildren();

  const layer = new window.Konva.Layer();
  const rawPoints = [
    ...(scenario.anchors ?? []).map((anchor) => anchor.fieldObservation.point),
    ...(scenario.observedElements ?? []).map((element) => element.point),
    ...((result?.projectedCheckpoints ?? []).map((entry) => entry.projectedPoint)),
    ...((result?.candidates ?? [])
      .map((candidate) => candidate.evidenceRegion?.center)
      .filter(Boolean))
  ];
  const projector = createProjector(
    rawPoints,
    currentStage.width(),
    currentStage.height()
  );

  layer.add(
    new window.Konva.Rect({
      x: 0,
      y: 0,
      width: currentStage.width(),
      height: currentStage.height(),
      fill: "rgba(251, 248, 242, 0.16)"
    })
  );

  const anchorPoints = (scenario.anchors ?? []).map((anchor, index) => ({
    anchor,
    index,
    point: projector.project(anchor.fieldObservation.point)
  }));

  if (anchorPoints.length >= 2) {
    layer.add(
      new window.Konva.Line({
        points: anchorPoints.flatMap((entry) => [entry.point.x, entry.point.y]),
        stroke: "#1f2e38",
        strokeWidth: 3,
        lineCap: "round"
      })
    );
  }

  for (const entry of anchorPoints) {
    const circle = new window.Konva.Circle({
      x: entry.point.x,
      y: entry.point.y,
      radius: 9,
      fill: "#1f2e38",
      draggable: true
    });
    circle.on("dragend", () => {
      const nextPoint = projector.invert(circle.position());
      applyDraggedPoint("anchor", entry.index, nextPoint);
    });
    layer.add(circle);
    drawLabel(layer, entry.anchor.anchorId, entry.point, "#1f2e38");
  }

  for (const [index, element] of (scenario.observedElements ?? []).entries()) {
    const point = projector.project(element.point);
    const rect = new window.Konva.Rect({
      x: point.x - 10,
      y: point.y - 10,
      width: 20,
      height: 20,
      cornerRadius: 5,
      fill: "#74603e",
      draggable: true
    });
    rect.on("dragend", () => {
      const nextPoint = projector.invert({
        x: rect.x() + 10,
        y: rect.y() + 10
      });
      applyDraggedPoint("observed", index, nextPoint);
    });
    layer.add(rect);
    drawLabel(layer, element.elementId, point, "#74603e");
  }

  for (const checkpoint of result?.projectedCheckpoints ?? []) {
    const point = projector.project(checkpoint.projectedPoint);
    const radius = Math.max(checkpoint.expectedNeighborhood.allowedRadius, 8);
    const searchRadius = Math.max(checkpoint.expectedNeighborhood.searchRadius, 14);

    layer.add(
      new window.Konva.Circle({
        x: point.x,
        y: point.y,
        radius: searchRadius,
        stroke: "#8eb7cf",
        dash: [8, 6],
        strokeWidth: 2
      })
    );
    layer.add(
      new window.Konva.Circle({
        x: point.x,
        y: point.y,
        radius,
        stroke: "#22779a",
        strokeWidth: 2
      })
    );
    layer.add(
      new window.Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 6,
        fill: "#22779a"
      })
    );
    drawLabel(layer, checkpoint.checkpointId, point, "#22779a");
  }

  for (const candidate of result?.candidates ?? []) {
    const center = candidate.evidenceRegion?.center;
    if (!center) {
      continue;
    }

    const point = projector.project(center);
    const color =
      candidate.candidateType === "missing"
        ? "#b04637"
        : candidate.candidateType === "position_diff"
          ? "#2a5f86"
          : "#916117";

    layer.add(
      new window.Konva.Ring({
        x: point.x,
        y: point.y,
        innerRadius: 12,
        outerRadius: 18,
        stroke: color,
        strokeWidth: 4
      })
    );

    if (candidate.candidateId === selectedCandidateId) {
      layer.add(
        new window.Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 28,
          stroke: "#f28f3b",
          strokeWidth: 4,
          dash: [10, 6]
        })
      );
      layer.add(
        new window.Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 6,
          fill: "#f28f3b"
        })
      );
    }

    drawLabel(layer, candidate.candidateType, point, color);
  }

  currentStage.add(layer);

  const candidateCount = result?.candidates?.length ?? 0;
  const scenarioName =
    getScenarioMetadata().name || scenario.segment?.label || scenario.segment?.segmentId;
  document.querySelector("#visual-caption").textContent = result
    ? `${scenarioName}: ${candidateCount}개 후보를 렌더링했습니다. 후보 카드를 누르면 캔버스에서 해당 위치가 강조됩니다.`
    : `${scenarioName}: 앵커와 관측 요소를 드래그해서 좌표를 바로 조정할 수 있습니다.`;
}

async function runEngine() {
  try {
    const scenario = parseScenario();
    saveScenario();
    await loadReviewSession();
    const result = isLocalShellMode()
      ? generateComparisonCandidates(scenario)
      : await (async () => {
          const response = await fetch("/api/engine/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: stringify(scenario)
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error ?? "Engine run failed.");
          }

          return payload;
        })();

    lastRunResult = result;
    selectedCandidateId = result.candidates[0]?.candidateId ?? null;
    renderMetrics(result);
    renderScenarioValidation(scenario);
    renderSummary(result);
    renderProjectedCheckpoints(result);
    renderReviewSummary(result);
    renderCandidates(result);
    renderSelectedCandidateDetail(result);
    renderOutput(result);
    renderCanvas({ scenario, result });
    renderFormBuilder();
    document.querySelector("#engine-status").textContent = "Ready";
    document.querySelector("#engine-status-detail").textContent =
      `${result.candidates.length} candidates from ${result.segmentId}`;
    setFlash("엔진 실행이 완료됐습니다.");
  } catch (error) {
    document.querySelector("#engine-status").textContent = "Error";
    document.querySelector("#engine-status-detail").textContent = error.message;
    setFlash(error.message, true);
  }
}

async function listSavedScenarios() {
  const scenarios = isLocalShellMode()
    ? readLibrary(SCENARIO_LIBRARY_KEY, [])
    : await (async () => {
        const response = await fetch("/api/engine/scenarios");
        return response.json();
      })();
  const root = document.querySelector("#scenario-list");
  root.innerHTML = "";

  if (!scenarios.length) {
    root.innerHTML = "<p>저장된 시나리오가 없습니다.</p>";
    return;
  }

  for (const scenario of scenarios) {
    const article = document.createElement("article");
    article.className = "saved-scenario-card";
    article.innerHTML = `
      <strong>${scenario.name}</strong>
      <p>${scenario.description ?? "설명이 없습니다."}</p>
      <p>updated: ${scenario.updatedAt}</p>
      <button type="button">불러오기</button>
    `;

    article.querySelector("button").addEventListener("click", async () => {
      const showResponse = await fetch(
        `/api/engine/scenario/show?scenarioId=${encodeURIComponent(scenario.id)}`
      );
      const entry = await showResponse.json();
      applySavedScenario(entry);
      setFlash(`시나리오 ${entry.name}을 불러왔습니다.`);
    });

    root.appendChild(article);
  }
}

async function saveScenarioToServer() {
  const metadata = getScenarioMetadata();

  if (!metadata.id || !metadata.name) {
    throw new Error("Scenario ID and name are required.");
  }

  const saved = isLocalShellMode()
    ? (() => {
        const library = readLibrary(SCENARIO_LIBRARY_KEY, []);
        const nextEntry = {
          ...metadata,
          scenario: parseScenario(),
          updatedAt: new Date().toISOString()
        };
        writeLibrary(
          SCENARIO_LIBRARY_KEY,
          [nextEntry, ...library.filter((entry) => entry.id !== metadata.id)]
        );
        return nextEntry;
      })()
    : await (async () => {
        const response = await fetch("/api/engine/scenario/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: stringify({
            ...metadata,
            scenario: parseScenario()
          })
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save scenario.");
        }

        return payload;
      })();

  await listSavedScenarios();
  setFlash(`시나리오 ${saved.name}을 저장했습니다.`);
}

async function loadReviewSession() {
  const scenarioId = getScenarioMetadata().id || "door-left-wall";
  currentReviewSession = isLocalShellMode()
    ? readLibrary(REVIEW_LIBRARY_KEY, []).find((entry) => entry.scenarioId === scenarioId) ?? {
        scenarioId,
        reviews: []
      }
    : await (async () => {
        const response = await fetch(
          `/api/engine/review/show?scenarioId=${encodeURIComponent(scenarioId)}`
        );
        return response.json();
      })();
}

async function saveCandidateReview(candidateId, status, note) {
  const scenarioId = getScenarioMetadata().id || "door-left-wall";
  currentReviewSession = isLocalShellMode()
    ? (() => {
        const library = readLibrary(REVIEW_LIBRARY_KEY, []);
        const existing =
          library.find((entry) => entry.scenarioId === scenarioId) ??
          { scenarioId, reviews: [] };
        const reviews = existing.reviews.filter((entry) => entry.candidateId !== candidateId);
        reviews.push({ candidateId, status, note });
        const nextSession = { scenarioId, reviews };
        writeLibrary(
          REVIEW_LIBRARY_KEY,
          [...library.filter((entry) => entry.scenarioId !== scenarioId), nextSession]
        );
        return nextSession;
      })()
    : await (async () => {
        const response = await fetch("/api/engine/review/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: stringify({
            scenarioId,
            review: {
              candidateId,
              status,
              note
            }
          })
        });
        return response.json();
      })();

  if (lastRunResult) {
    renderReviewSummary(lastRunResult);
    renderCandidates(lastRunResult);
    renderSelectedCandidateDetail(lastRunResult);
  }

  setFlash(`후보 ${candidateId}를 ${status} 상태로 저장했습니다.`);
}

function resetOutputPanels() {
  selectedCandidateId = null;
  document.querySelector("#output").textContent = "No output yet.";
  document.querySelector("#candidate-cards").innerHTML =
    '<p class="empty-state">아직 후보 출력이 없습니다.</p>';
  document.querySelector("#projected-checkpoints").innerHTML =
    "<p>아직 투영된 체크포인트가 없습니다.</p>";
  document.querySelector("#review-summary").innerHTML =
    "<p>아직 검토 요약이 없습니다.</p>";
  document.querySelector("#engine-summary").innerHTML =
    "<p>엔진을 실행하면 정합 결과와 후보가 여기에 표시됩니다.</p>";
  document.querySelector("#metric-candidate-count").textContent = "0";
  const detail = document.querySelector("#candidate-detail");
  if (detail) {
    detail.innerHTML =
      "<p>Select a candidate card to inspect the evidence basis.</p>";
  }
}

function bindEvents() {
  for (const button of document.querySelectorAll("[data-screen-target]")) {
    button.addEventListener("click", () => {
      setScreen(button.dataset.screenTarget);
      renderCanvas({ scenario: parseScenario(), result: null });
    });
  }

  document.querySelector("#engine-scenario-input").addEventListener("input", () => {
    saveScenario();
    try {
      const scenario = parseScenario();
      renderMetrics();
      renderFormBuilder();
      renderScenarioValidation(scenario);
      renderSelectedCandidateDetail(lastRunResult);
      renderCanvas({ scenario, result: null });
      clearFlash();
    } catch {
      document.querySelector("#engine-status").textContent = "Draft";
      document.querySelector("#engine-status-detail").textContent =
        "Scenario JSON needs formatting.";
    }
  });

  for (const input of document.querySelectorAll(
    "#scenario-id-input, #scenario-title-input, #scenario-description-input"
  )) {
    input.addEventListener("input", () => {
      saveScenario();
      renderMetrics();
      renderScenarioValidation(parseScenario());
      renderCanvas({ scenario: parseScenario(), result: null });
    });
  }

  document.querySelector("#form-segment-id").addEventListener("input", () => {
    syncSegmentFormToEditor();
  });
  document.querySelector("#form-segment-kind").addEventListener("input", () => {
    syncSegmentFormToEditor();
  });
  document.querySelector("#form-segment-label").addEventListener("input", () => {
    syncSegmentFormToEditor();
  });

  for (const button of document.querySelectorAll("[data-action='run-engine']")) {
    button.addEventListener("click", runEngine);
  }

  document
    .querySelector("[data-action='start-camera']")
    .addEventListener("click", async () => {
      try {
        await startCamera();
        setFlash("Camera started. Overlay is now drawn over the live feed.");
      } catch (error) {
        setFlash(error.message, true);
      }
    });

  document
    .querySelector("[data-action='capture-camera']")
    .addEventListener("click", () => {
      try {
        captureCameraFrame();
        setFlash("Captured the current camera frame.");
      } catch (error) {
        setFlash(error.message, true);
      }
    });

  document
    .querySelector("[data-action='stop-camera']")
    .addEventListener("click", () => {
      stopCamera();
      setFlash("Camera stopped.");
    });

  document
    .querySelector("[data-action='reset-scenario']")
    .addEventListener("click", () => {
      document.querySelector("#scenario-id-input").value = "door-left-wall";
      document.querySelector("#scenario-title-input").value = "Door Left Wall";
      document.querySelector("#scenario-description-input").value =
        "Default local segment for engine iteration.";
      applyScenario(defaultScenario);
      currentReviewSession = {
        scenarioId: "door-left-wall",
        reviews: []
      };
      resetOutputPanels();
      setFlash("기본 시나리오로 초기화했습니다.");
    });

  document
    .querySelector("[data-action='format-scenario']")
    .addEventListener("click", () => {
      applyScenario(parseScenario());
      setFlash("시나리오 JSON 형식을 정리했습니다.");
    });

  document
    .querySelector("[data-action='load-missing-example']")
    .addEventListener("click", () => {
      applyScenario(createMissingExample());
      resetOutputPanels();
      setFlash("missing 예제를 불러왔습니다.");
    });

  document
    .querySelector("[data-action='load-position-example']")
    .addEventListener("click", () => {
      applyScenario(createPositionExample());
      resetOutputPanels();
      setFlash("position_diff 예제를 불러왔습니다.");
    });

  document
    .querySelector("[data-action='load-extra-example']")
    .addEventListener("click", () => {
      applyScenario(createExtraExample());
      resetOutputPanels();
      setFlash("extra 예제를 불러왔습니다.");
    });

  document.querySelector("[data-action='add-anchor']").addEventListener("click", () => {
    updateScenario((draft) => {
      draft.anchors.push({
        anchorId: `anchor-${draft.anchors.length + 1}`,
        segmentId: draft.segment.segmentId,
        anchorKind: "wall_corner",
        geometryType: "point",
        drawingReference: { point: { x: 0, y: 0 } },
        fieldObservation: { point: { x: 160, y: 160 } },
        stabilityScore: 0.8,
        visibilityState: "visible"
      });
    });
    setFlash("앵커를 추가했습니다.");
  });

  document
    .querySelector("[data-action='add-checkpoint']")
    .addEventListener("click", () => {
      updateScenario((draft) => {
        draft.checkpoints.push({
          checkpointId: `checkpoint-${draft.checkpoints.length + 1}`,
          segmentId: draft.segment.segmentId,
          anchorBasis: draft.anchors.slice(0, 2).map((anchor) => anchor.anchorId),
          coordinateModel: "span_ratio_plus_height_ratio",
          normalizedPosition: {
            spanRatio: 0.5,
            heightRatio: 0
          },
          allowedTolerance: {
            positionSpanRatio: 0.05,
            searchSpanRatio: 0.2
          },
          semanticExpectation: "switch_box"
        });
      });
      setFlash("체크포인트를 추가했습니다.");
    });

  document
    .querySelector("[data-action='add-observed']")
    .addEventListener("click", () => {
      updateScenario((draft) => {
        draft.observedElements.push({
          elementId: `observed-${draft.observedElements.length + 1}`,
          segmentId: draft.segment.segmentId,
          elementKind: "switch_box",
          point: { x: 200, y: 120 }
        });
      });
      setFlash("관측 요소를 추가했습니다.");
    });

  document
    .querySelector("[data-action='clear-output']")
    .addEventListener("click", () => {
      lastRunResult = null;
      resetOutputPanels();
      renderCanvas({ scenario: parseScenario(), result: null });
      setFlash("엔진 출력과 후보 카드를 비웠습니다.");
    });

  for (const button of document.querySelectorAll("[data-action='list-scenarios']")) {
    button.addEventListener("click", async () => {
      await listSavedScenarios();
      setFlash("저장된 시나리오 목록을 새로고침했습니다.");
    });
  }

  document
    .querySelector("[data-action='save-scenario']")
    .addEventListener("click", async () => {
      try {
        await saveScenarioToServer();
      } catch (error) {
        setFlash(error.message, true);
      }
    });

  window.addEventListener("resize", () => {
    stage = null;
    renderCanvas({ scenario: parseScenario(), result: lastRunResult });
  });

  window.addEventListener("beforeunload", () => {
    stopCamera();
  });
}

function init() {
  const saved = loadScenario();
  document.querySelector("#scenario-id-input").value = saved.metadata.id;
  document.querySelector("#scenario-title-input").value = saved.metadata.name;
  document.querySelector("#scenario-description-input").value =
    saved.metadata.description;
  document.querySelector("#engine-scenario-input").value = saved.scenarioText;
  renderScenarioValidation(parseScenario());
  renderMetrics();
  resetOutputPanels();
  bindEvents();
  renderFormBuilder();
  renderCanvas({ scenario: parseScenario(), result: null });
  void loadReviewSession();
  void listSavedScenarios();
}

init();
