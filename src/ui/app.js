import { generateComparisonCandidates } from "./engine/baseMarkEngine.js";
import { extractDrawingStructureFromSvg } from "./engine/drawingStructureExtractor.js";

const STORAGE_KEY = "basemark.engine.scenario.v1";
const SCENARIO_LIBRARY_KEY = "basemark.engine.scenario.library.v1";
const REVIEW_LIBRARY_KEY = "basemark.engine.review.library.v1";
const DRAWING_SOURCE_KEY = "basemark.engine.drawing.svg.v1";
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 520;
const ANCHOR_PRESETS = {
  window_left_top: {
    label: "창호 좌상단",
    anchorKind: "window_frame_left_top",
    idPrefix: "window-left-top",
    help: "창호 바깥 프레임의 왼쪽 위 꼭짓점을 누르세요."
  },
  window_right_top: {
    label: "창호 우상단",
    anchorKind: "window_frame_right_top",
    idPrefix: "window-right-top",
    help: "창호 바깥 프레임의 오른쪽 위 꼭짓점을 누르세요."
  },
  window_left_bottom: {
    label: "창호 좌하단",
    anchorKind: "window_frame_left_bottom",
    idPrefix: "window-left-bottom",
    help: "창호 바깥 프레임의 왼쪽 아래 꼭짓점을 누르세요."
  },
  window_right_bottom: {
    label: "창호 우하단",
    anchorKind: "window_frame_right_bottom",
    idPrefix: "window-right-bottom",
    help: "창호 바깥 프레임의 오른쪽 아래 꼭짓점을 누르세요."
  },
  wall_left_corner: {
    label: "벽 좌측 모서리",
    anchorKind: "wall_left_corner",
    idPrefix: "wall-left-corner",
    help: "비교 구간에서 왼쪽 끝 벽 모서리를 누르세요."
  },
  wall_right_corner: {
    label: "벽 우측 모서리",
    anchorKind: "wall_right_corner",
    idPrefix: "wall-right-corner",
    help: "비교 구간에서 오른쪽 끝 벽 모서리를 누르세요."
  }
};

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
  metricCalibration: {
    referenceAnchorBasis: ["anchor-left", "anchor-right"],
    knownDistanceMm: 900
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
let lastDrawingExtraction = null;
let cameraStream = null;
let placementMode = "none";
let selectedBuilderEntity = null;
let selectedAnchorPreset = "window_left_top";

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

function getPlacementLabel(mode) {
  if (mode === "anchor") {
    return "기준점 배치 중";
  }
  if (mode === "observed") {
    return "관측 요소 배치 중";
  }
  return "배치 모드 없음";
}

function loadDrawingSource() {
  return (
    localStorage.getItem(DRAWING_SOURCE_KEY) ??
    `<svg width="320" height="220" xmlns="http://www.w3.org/2000/svg">
  <rect id="window-frame" x="70" y="40" width="120" height="120" />
  <line id="wall-left" x1="30" y1="20" x2="30" y2="200" />
  <line id="wall-top" x1="30" y1="20" x2="220" y2="20" />
</svg>`
  );
}

function saveDrawingSource() {
  const input = document.querySelector("#drawing-svg-input");
  if (!input) {
    return;
  }

  localStorage.setItem(DRAWING_SOURCE_KEY, input.value);
}

function renderPlacementStatus() {
  const tag = document.querySelector("#placement-status");
  if (!tag) {
    return;
  }

  tag.textContent = getPlacementLabel(placementMode);
  tag.classList.toggle("is-active", placementMode !== "none");

  for (const button of document.querySelectorAll("[data-placement-mode]")) {
    button.classList.toggle("is-active", button.dataset.placementMode === placementMode);
  }

  const canvas = document.querySelector("#visual-canvas");
  if (canvas) {
    canvas.classList.toggle("is-placement-active", placementMode !== "none");
  }
}

function getSelectedAnchorPreset() {
  return ANCHOR_PRESETS[selectedAnchorPreset] ?? ANCHOR_PRESETS.window_left_top;
}

function getWorkflowState(scenario = parseScenario()) {
  const anchorCount = scenario.anchors?.length ?? 0;
  const observedCount = scenario.observedElements?.length ?? 0;

  return {
    anchorCount,
    observedCount,
    hasEnoughAnchors: anchorCount >= 2,
    hasObservedElements: observedCount > 0,
    canRun: anchorCount >= 2 && observedCount > 0
  };
}

function renderWorkflowSummary(scenario = parseScenario(), result = lastRunResult) {
  const root = document.querySelector("#workflow-summary");
  if (!root) {
    return;
  }

  const state = getWorkflowState(scenario);
  const runState = result
    ? `${result.candidates.length}개 후보 생성`
    : state.canRun
      ? "후보 찾기 준비 완료"
      : "아직 분석 전";

  root.innerHTML = `
    <p>기준점 ${state.anchorCount}/2 · 보이는 대상 ${state.observedCount}개 · ${runState}</p>
  `;
}

function renderActionReadiness(scenario = parseScenario()) {
  const state = getWorkflowState(scenario);
  const observedButton = document.querySelector("[data-action='place-observed']");
  const runButtons = document.querySelectorAll("[data-action='run-engine']");
  const resumeButton = document.querySelector("[data-action='resume-next-step']");

  if (observedButton) {
    observedButton.disabled = !state.hasEnoughAnchors;
    observedButton.title = state.hasEnoughAnchors
      ? "사진에서 실제로 보이는 대상을 찍습니다."
      : "먼저 기준점 두 개를 잡아야 보이는 대상을 찍을 수 있습니다.";
  }

  for (const button of runButtons) {
    button.disabled = !state.canRun;
    button.title = state.canRun
      ? "후보를 계산합니다."
      : "기준점 두 개와 보이는 대상 하나 이상이 있어야 후보를 찾을 수 있습니다.";
  }

  if (resumeButton) {
    resumeButton.disabled = false;
  }
}

function renderAnchorPresetUI() {
  for (const button of document.querySelectorAll("[data-anchor-preset]")) {
    button.classList.toggle("is-active", button.dataset.anchorPreset === selectedAnchorPreset);
  }

  const help = document.querySelector("#anchor-preset-help");
  if (!help) {
    return;
  }

  const preset = getSelectedAnchorPreset();
  help.textContent = `선택된 기준점: ${preset.label}. ${preset.help}`;
}

function renderRatioSummary(scenario = parseScenario()) {
  const root = document.querySelector("#ratio-summary");
  if (!root) {
    return;
  }

  root.innerHTML = "";

  if (!scenario.checkpoints?.length) {
    root.innerHTML = "<p>체크포인트가 아직 없습니다. 체크포인트를 추가하면 기준 비율이 여기에 표시됩니다.</p>";
    return;
  }

  for (const checkpoint of scenario.checkpoints) {
    const article = document.createElement("article");
    article.className = "checkpoint-card";
    article.innerHTML = `
      <strong>${checkpoint.checkpointId}</strong>
      <p>기준점 쌍: ${(checkpoint.anchorBasis ?? []).join(" -> ") || "없음"}</p>
      <p>가로 비율(spanRatio): ${checkpoint.normalizedPosition?.spanRatio ?? "n/a"}</p>
      <p>세로 비율(heightRatio): ${checkpoint.normalizedPosition?.heightRatio ?? "n/a"}</p>
      <p>기대 요소: ${checkpoint.semanticExpectation ?? "n/a"}</p>
    `;
    root.appendChild(article);
  }
}

function renderFieldGuide(scenario = parseScenario()) {
  const title = document.querySelector("#field-guide-title");
  const body = document.querySelector("#field-guide-body");
  if (!title || !body) {
    return;
  }

  const anchorCount = scenario.anchors?.length ?? 0;
  const observedCount = scenario.observedElements?.length ?? 0;
  const preset = getSelectedAnchorPreset();
  let activeStep = "anchors";

  if (placementMode === "anchor") {
    activeStep = "anchors";
    if (anchorCount === 0) {
      title.textContent = "첫 번째 기준점을 찍으세요.";
      body.textContent = `${preset.label} 기준점을 잡는 단계입니다. ${preset.help} 같은 구조에서 두 번째 기준점도 이어서 잡아야 비율이 의미를 가집니다.`;
    } else if (anchorCount === 1) {
      title.textContent = "두 번째 기준점을 찍으세요.";
      body.textContent = `첫 번째 기준점과 같은 구조선에 있는 짝을 찍어야 합니다. 예를 들어 좌상단을 찍었다면 같은 프레임의 우상단을 찍는 식으로 맞추세요. ${preset.help}`;
    } else {
      title.textContent = "기준점은 충분합니다.";
      body.textContent = "이제 사진에서 실제로 보이는 대상만 찍으면 됩니다. 스위치 박스나 노출된 박스처럼 비교할 대상을 표시하세요.";
    }
  } else if (placementMode === "observed") {
    activeStep = "observed";
    title.textContent = "보이는 대상을 찍으세요.";
    body.textContent = "사진에서 실제로 보이는 스위치, 박스, 마감 요소를 찍습니다. 기준점과 다르게 움직일 수 있는 대상이어도 괜찮습니다.";
  } else if (anchorCount < 2) {
    activeStep = "anchors";
    title.textContent = "먼저 기준점 두 개를 잡으세요.";
    body.textContent = "문틀 끝, 창호 바깥 프레임 모서리, 벽 코너처럼 잘 안 바뀌는 구조점을 고르세요. 같은 구조 기준에서 두 점을 잡는 것이 중요합니다.";
  } else if (observedCount === 0) {
    activeStep = "observed";
    title.textContent = "이제 보이는 대상을 찍으세요.";
    body.textContent = "기준점은 잡혔습니다. 사진에서 실제로 확인되는 대상만 표시한 뒤 후보 찾기를 누르면 됩니다.";
  } else if (!lastRunResult) {
    activeStep = "run";
    title.textContent = "후보 찾기를 누르세요.";
    body.textContent = "엔진이 빠짐, 추가, 위치 차이 후보를 계산합니다. 결과는 오른쪽 후보 검토 카드에 나타납니다.";
  } else {
    activeStep = "run";
    title.textContent = "후보가 생성되었습니다.";
    body.textContent = "후보 카드를 누르면 같은 위치가 캔버스에서 강조됩니다. 확인, 반려, 보류로 검토를 남길 수 있습니다.";
  }

  for (const chip of document.querySelectorAll("[data-step-chip]")) {
    chip.classList.toggle("is-active", chip.dataset.stepChip === activeStep);
  }
}

function setPlacementMode(mode) {
  placementMode = mode;
  renderPlacementStatus();
  renderAnchorPresetUI();
  renderFieldGuide();
  renderNextActionCard();
}

function setAnchorPreset(presetKey, activatePlacement = true) {
  if (!ANCHOR_PRESETS[presetKey]) {
    return;
  }

  selectedAnchorPreset = presetKey;
  renderAnchorPresetUI();

  if (activatePlacement) {
    setPlacementMode("anchor");
  } else {
    renderNextActionCard();
  }
}

function resumeNextStep() {
  const scenario = parseScenario();
  const state = getWorkflowState(scenario);

  if (state.anchorCount === 0) {
    setAnchorPreset("window_left_top");
    renderCanvas({ scenario, result: lastRunResult });
    setFlash("창호 좌상단 기준점을 찍어 주세요.");
    return;
  }

  if (state.anchorCount === 1) {
    const nextPresetKey = NEXT_ANCHOR_PRESET[selectedAnchorPreset] ?? "window_right_top";
    setAnchorPreset(nextPresetKey);
    renderCanvas({ scenario, result: lastRunResult });
    setFlash(`${getSelectedAnchorPreset().label} 기준점을 이어서 찍어 주세요.`);
    return;
  }

  if (!state.hasObservedElements) {
    setPlacementMode("observed");
    renderCanvas({ scenario, result: lastRunResult });
    setFlash("사진에서 실제로 보이는 대상 위치를 눌러 주세요.");
    return;
  }

  if (!lastRunResult) {
    void runEngine();
    return;
  }

  setFlash("오른쪽 후보 카드에서 확인, 반려, 보류를 남겨 주세요.");
}

function setSelectedBuilderEntity(kind, id, options = {}) {
  selectedBuilderEntity = kind && id ? { kind, id } : null;
  renderBuilderSelection();

  if (options.scroll) {
    const target = document.querySelector(
      `.form-card[data-builder-kind="${kind}"][data-builder-id="${id}"]`
    );
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function renderBuilderSelection() {
  for (const card of document.querySelectorAll(".form-card[data-builder-kind]")) {
    const isSelected =
      selectedBuilderEntity &&
      card.dataset.builderKind === selectedBuilderEntity.kind &&
      card.dataset.builderId === selectedBuilderEntity.id;
    card.classList.toggle("is-selected", Boolean(isSelected));
  }
}

function renderMetrics(result = null) {
  const scenario = parseScenario();
  const anchorCount = String(scenario.anchors.length);
  const checkpointCount = String(scenario.checkpoints.length);
  const observedCount = String(scenario.observedElements.length);
  const candidateCount = String(result?.candidates?.length ?? 0);

  document.querySelector("#metric-anchor-count").textContent = anchorCount;
  document.querySelector("#metric-checkpoint-count").textContent = checkpointCount;
  document.querySelector("#metric-observed-count").textContent = observedCount;
  document.querySelector("#metric-candidate-count").textContent = candidateCount;
  const inlineAnchor = document.querySelector("#metric-anchor-count-inline");
  const inlineObserved = document.querySelector("#metric-observed-count-inline");
  const inlineCandidate = document.querySelector("#metric-candidate-count-inline");
  if (inlineAnchor) {
    inlineAnchor.textContent = anchorCount;
  }
  if (inlineObserved) {
    inlineObserved.textContent = observedCount;
  }
  if (inlineCandidate) {
    inlineCandidate.textContent = candidateCount;
  }
  document.querySelector("#scenario-name").textContent =
    getScenarioMetadata().name || scenario.segment.label || scenario.segment.segmentId;
  document.querySelector("#scenario-detail").textContent =
    scenario.segment.label || "Editable local draft";
  renderRatioSummary(scenario);
  renderWorkflowSummary(scenario, result);
  renderActionReadiness(scenario);
  renderNextActionCard(scenario);
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
    screenName === "engine" ? "비교" : screenName === "workspace" ? "검토" : "홈";
}

function updateScenario(mutator) {
  const nextScenario = cloneScenario(parseScenario());
  mutator(nextScenario);
  writeScenarioToEditor(nextScenario);
  saveScenario();
  lastRunResult = null;
  renderMetrics();
  renderFormBuilder();
  renderCanvas({ scenario: nextScenario, result: null });
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
  lastRunResult = null;
  renderMetrics();
  renderFormBuilder();
  renderScenarioValidation(scenario);
  renderSelectedCandidateDetail(null);
  renderCanvas({ scenario, result: null });
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
    card.dataset.builderKind = "anchor";
    card.dataset.builderId = anchor.anchorId;
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
    card.addEventListener("click", () => {
      setSelectedBuilderEntity("anchor", anchor.anchorId);
    });
    anchorRoot.appendChild(card);
  });

  const checkpointRoot = document.querySelector("#checkpoint-form-list");
  checkpointRoot.innerHTML = "";
  scenario.checkpoints.forEach((checkpoint, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.dataset.builderKind = "checkpoint";
    card.dataset.builderId = checkpoint.checkpointId;
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
    card.addEventListener("click", () => {
      setSelectedBuilderEntity("checkpoint", checkpoint.checkpointId);
    });
    checkpointRoot.appendChild(card);
  });

  const observedRoot = document.querySelector("#observed-form-list");
  observedRoot.innerHTML = "";
  scenario.observedElements.forEach((element, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.dataset.builderKind = "observed";
    card.dataset.builderId = element.elementId;
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
    card.addEventListener("click", () => {
      setSelectedBuilderEntity("observed", element.elementId);
    });
    observedRoot.appendChild(card);
  });

  renderBuilderSelection();
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
  const scenario = parseScenario();
  const root = document.querySelector("#projected-checkpoints");
  root.innerHTML = "";

  if (!result.projectedCheckpoints.length) {
    root.innerHTML = "<p>아직 투영된 체크포인트가 없습니다.</p>";
    return;
  }

  for (const checkpoint of result.projectedCheckpoints) {
    const sourceCheckpoint = scenario.checkpoints.find(
      (entry) => entry.checkpointId === checkpoint.checkpointId
    );
    const article = document.createElement("article");
    article.className = "checkpoint-card";
    article.innerHTML = `
      <strong>${checkpoint.checkpointId}</strong>
      <p>기대 요소: ${checkpoint.semanticExpectation}</p>
      <p>기준점 쌍: ${sourceCheckpoint?.anchorBasis?.join(" -> ") || "없음"}</p>
      <p>가로 비율: ${sourceCheckpoint?.normalizedPosition?.spanRatio ?? "n/a"}</p>
      <p>세로 비율: ${sourceCheckpoint?.normalizedPosition?.heightRatio ?? "n/a"}</p>
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
    const candidate = lastRunResult.candidates.find(
      (entry) => entry.candidateId === candidateId
    );
    if (candidate?.checkpointId) {
      setSelectedBuilderEntity("checkpoint", candidate.checkpointId, { scroll: true });
    }
  }

  if (lastRunResult) {
    renderCanvas({ scenario: parseScenario(), result: lastRunResult });
    renderSelectedCandidateDetail(lastRunResult);
  }
}

function applyScenario(value) {
  writeScenarioToEditor(value);
  saveScenario();
  lastRunResult = null;
  renderMetrics();
  renderFormBuilder();
  renderScenarioValidation(value);
  renderSelectedCandidateDetail(null);
  renderCanvas({ scenario: value, result: null });
  selectedCandidateId = null;
  selectedBuilderEntity = null;
}

function applySavedScenario(entry) {
  document.querySelector("#scenario-id-input").value = entry.id ?? "";
  document.querySelector("#scenario-title-input").value = entry.name ?? "";
  document.querySelector("#scenario-description-input").value =
    entry.description ?? "";
  writeScenarioToEditor(entry.scenario);
  saveScenario();
  lastRunResult = null;
  renderMetrics();
  renderFormBuilder();
  renderScenarioValidation(entry.scenario);
  renderSelectedCandidateDetail(null);
  renderCanvas({ scenario: entry.scenario, result: null });
  selectedBuilderEntity = null;
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
      ? `Anchor moved to (${point.x}, ${point.y}).`
      : `Observed element moved to (${point.x}, ${point.y}).`
  );
  const scenario = parseScenario();
  if (kind === "anchor") {
    setSelectedBuilderEntity("anchor", scenario.anchors[index]?.anchorId);
  }
  if (kind === "observed") {
    setSelectedBuilderEntity("observed", scenario.observedElements[index]?.elementId);
  }
}

function addAnchorAtPoint(point) {
  const preset = getSelectedAnchorPreset();
  const scenario = updateScenario((draft) => {
    const sameKindCount = draft.anchors.filter(
      (anchor) => anchor.anchorKind === preset.anchorKind
    ).length;
    draft.anchors.push({
      anchorId: `${preset.idPrefix}-${sameKindCount + 1}`,
      segmentId: draft.segment.segmentId,
      anchorKind: preset.anchorKind,
      geometryType: "point",
      drawingReference: { point: { x: 0, y: 0 } },
      fieldObservation: { point },
      stabilityScore: 0.8,
      visibilityState: "visible"
    });
  });

  setPlacementMode("none");
  setSelectedBuilderEntity("anchor", scenario.anchors.at(-1)?.anchorId, { scroll: true });
  renderScenarioValidation(scenario);
  renderSelectedCandidateDetail(lastRunResult);
  setFlash(`${preset.label} 기준점을 (${point.x}, ${point.y})에 추가했습니다.`);
}

function addObservedAtPoint(point) {
  const scenario = updateScenario((draft) => {
    const observedIndex = draft.observedElements.length + 1;
    draft.observedElements.push({
      elementId: `observed-${observedIndex}`,
      segmentId: draft.segment.segmentId,
      elementKind: "switch_box",
      point
    });
  });

  setPlacementMode("none");
  setSelectedBuilderEntity("observed", scenario.observedElements.at(-1)?.elementId, {
    scroll: true
  });
  renderScenarioValidation(scenario);
  renderSelectedCandidateDetail(lastRunResult);
  renderCanvas({ scenario, result: lastRunResult });
  setFlash(`보이는 대상을 (${point.x}, ${point.y})에 추가했습니다. 이제 후보 찾기를 누르세요.`);
}

function renderCanvas({ scenario, result }) {
  if (!window.Konva) {
    document.querySelector("#visual-caption").textContent =
      "Konva did not load, so the overlay cannot be rendered.";
    renderPlacementStatus();
    return;
  }

  const currentStage = stage ?? createStage();
  currentStage.destroyChildren();

  const layer = new window.Konva.Layer();
  const background = new window.Konva.Rect({
    x: 0,
    y: 0,
    width: currentStage.width(),
    height: currentStage.height(),
    fill: "rgba(251, 248, 242, 0.16)"
  });
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

  layer.add(background);

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

  if (placementMode !== "none") {
    const preset = getSelectedAnchorPreset();
    const placementLabel = new window.Konva.Label({
      x: 18,
      y: 18,
      opacity: 0.96,
      listening: false
    });
    placementLabel.add(
      new window.Konva.Tag({
        fill: "rgba(187, 76, 46, 0.92)",
        cornerRadius: 999
      })
    );
    placementLabel.add(
      new window.Konva.Text({
        text:
          placementMode === "anchor"
            ? `${preset.label} 위치를 누르세요`
            : "보이는 대상 위치를 누르세요",
        fontFamily: "Georgia",
        fontSize: 14,
        padding: 10,
        fill: "#fff8ee"
      })
    );
    layer.add(placementLabel);
  }

  currentStage.add(layer);
  currentStage.off("click tap");
  currentStage.on("click tap", (event) => {
    if (placementMode === "none") {
      return;
    }

    const pointer = currentStage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const nextPoint = projector.invert(pointer);
    if (placementMode === "anchor") {
      addAnchorAtPoint(nextPoint);
      return;
    }

    if (placementMode === "observed") {
      addObservedAtPoint(nextPoint);
    }
  });

  const candidateCount = result?.candidates?.length ?? 0;
  const scenarioName =
    getScenarioMetadata().name || scenario.segment?.label || scenario.segment?.segmentId;
  const baseCaption = result
    ? `${scenarioName}: 후보 ${candidateCount}개가 계산되었습니다. 후보 카드를 누르면 같은 위치가 화면에서 강조됩니다.`
    : `${scenarioName}: 기준점과 보이는 대상을 움직여 위치를 맞출 수 있습니다.`;
  const placementHint =
    placementMode === "anchor"
      ? ` ${getSelectedAnchorPreset().help}`
      : placementMode === "observed"
        ? " 사진에서 실제로 보이는 대상 위치를 누르세요."
        : "";
  document.querySelector("#visual-caption").textContent = `${baseCaption}${placementHint}`;
  renderPlacementStatus();
  renderFieldGuide(scenario);
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
    root.innerHTML = "<p>No saved scenarios yet.</p>";
    return;
  }

  for (const scenario of scenarios) {
    const article = document.createElement("article");
    article.className = "saved-scenario-card";
    article.innerHTML = `
      <strong>${scenario.name}</strong>
      <p>${scenario.description ?? "No description available."}</p>
      <p>updated: ${scenario.updatedAt}</p>
      <button type="button">Load</button>
    `;

    article.querySelector("button").addEventListener("click", async () => {
      const entry = isLocalShellMode()
        ? readLibrary(SCENARIO_LIBRARY_KEY, []).find((item) => item.id === scenario.id)
        : await (async () => {
            const showResponse = await fetch(
              `/api/engine/scenario/show?scenarioId=${encodeURIComponent(scenario.id)}`
            );
            return showResponse.json();
          })();

      if (!entry) {
        setFlash("Could not find the selected scenario.", true);
        return;
      }

      applySavedScenario(entry);
      setFlash(`Loaded scenario ${entry.name}.`);
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
    '<p class="empty-state">No candidate output yet.</p>';
  document.querySelector("#projected-checkpoints").innerHTML =
    "<p>No projected checkpoints yet.</p>";
  document.querySelector("#review-summary").innerHTML =
    "<p>No review summary yet.</p>";
  document.querySelector("#engine-summary").innerHTML =
    "<p>Run the engine to inspect alignment and candidate output.</p>";
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
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
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
      renderCanvas({ scenario, result: lastRunResult });
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
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
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

  document.querySelector("#drawing-svg-input").addEventListener("input", () => {
    saveDrawingSource();
  });

  for (const button of document.querySelectorAll("[data-action='run-engine']")) {
    button.addEventListener("click", runEngine);
  }

  document
    .querySelector("[data-action='extract-drawing-structure']")
    .addEventListener("click", async () => {
      try {
        await extractDrawingStructure();
      } catch (error) {
        setFlash(error.message, true);
      }
    });

  document
    .querySelector("[data-action='start-camera']")
    .addEventListener("click", async () => {
      try {
        await startCamera();
        setFlash("Camera started. The overlay is now shown on the live feed.");
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
    .querySelector("[data-action='place-anchor']")
    .addEventListener("click", () => {
      setPlacementMode("anchor");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash(`기준점 배치 중입니다. ${getSelectedAnchorPreset().help}`);
    });

  document
    .querySelector("[data-action='place-observed']")
    .addEventListener("click", () => {
      setPlacementMode("observed");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash("사진에서 실제로 보이는 대상 위치를 누르세요.");
    });

  document
    .querySelector("[data-action='cancel-placement']")
    .addEventListener("click", () => {
      setPlacementMode("none");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash("배치 모드를 취소했습니다.");
    });

  for (const button of document.querySelectorAll("[data-anchor-preset]")) {
    button.addEventListener("click", () => {
      setAnchorPreset(button.dataset.anchorPreset);
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash(`기준점 역할을 ${getSelectedAnchorPreset().label}으로 바꿨습니다. ${getSelectedAnchorPreset().help}`);
    });
  }

  document
    .querySelector("[data-action='start-window-flow']")
    .addEventListener("click", () => {
      setAnchorPreset("window_left_top");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash("창호 기준 흐름을 시작합니다. 먼저 창호 좌상단 기준점을 찍어 주세요.");
    });

  document
    .querySelector("[data-action='start-wall-flow']")
    .addEventListener("click", () => {
      setAnchorPreset("wall_left_corner");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash("벽 코너 기준 흐름을 시작합니다. 먼저 왼쪽 벽 모서리를 찍어 주세요.");
    });

  document
    .querySelector("[data-action='resume-next-step']")
    .addEventListener("click", () => {
      resumeNextStep();
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
      setPlacementMode("none");
      resetOutputPanels();
      setFlash("Reset to the default scenario.");
    });

  document
    .querySelector("[data-action='format-scenario']")
    .addEventListener("click", () => {
      applyScenario(parseScenario());
      setPlacementMode("none");
      setFlash("Formatted the scenario JSON.");
    });

  document
    .querySelector("[data-action='load-missing-example']")
    .addEventListener("click", () => {
      applyScenario(createMissingExample());
      setPlacementMode("none");
      resetOutputPanels();
      setFlash("Loaded the missing example.");
    });

  document
    .querySelector("[data-action='load-position-example']")
    .addEventListener("click", () => {
      applyScenario(createPositionExample());
      setPlacementMode("none");
      resetOutputPanels();
      setFlash("Loaded the position_diff example.");
    });

  document
    .querySelector("[data-action='load-extra-example']")
    .addEventListener("click", () => {
      applyScenario(createExtraExample());
      setPlacementMode("none");
      resetOutputPanels();
      setFlash("Loaded the extra example.");
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
    setFlash("Added a new anchor.");
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
      setFlash("Added a new checkpoint.");
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
      setFlash("Added a new observed element.");
    });

  document
    .querySelector("[data-action='clear-output']")
    .addEventListener("click", () => {
      lastRunResult = null;
      setPlacementMode("none");
      resetOutputPanels();
      renderCanvas({ scenario: parseScenario(), result: null });
      setFlash("Cleared engine output and candidate cards.");
    });

  for (const button of document.querySelectorAll("[data-action='list-scenarios']")) {
    button.addEventListener("click", async () => {
      await listSavedScenarios();
      setFlash("Refreshed the saved scenario list.");
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

/* const UI_ANCHOR_PRESETS = {
  window_left_top: {
    label: "창호 좌상단",
    anchorKind: "window_frame_left_top",
    idPrefix: "window-left-top",
    help: "창호의 움직이는 창짝이 아니라 바깥 고정 프레임의 왼쪽 위 모서리를 누르세요."
  },
  window_right_top: {
    label: "창호 우상단",
    anchorKind: "window_frame_right_top",
    idPrefix: "window-right-top",
    help: "같은 바깥 프레임 기준으로 오른쪽 위 모서리를 누르세요."
  },
  window_left_bottom: {
    label: "창호 좌하단",
    anchorKind: "window_frame_left_bottom",
    idPrefix: "window-left-bottom",
    help: "바깥 고정 프레임의 왼쪽 아래 모서리를 누르세요."
  },
  window_right_bottom: {
    label: "창호 우하단",
    anchorKind: "window_frame_right_bottom",
    idPrefix: "window-right-bottom",
    help: "같은 바깥 프레임 기준으로 오른쪽 아래 모서리를 누르세요."
  },
  wall_left_corner: {
    label: "벽 좌측 모서리",
    anchorKind: "wall_left_corner",
    idPrefix: "wall-left-corner",
    help: "비교 구간에서 왼쪽 벽 코너처럼 고정된 구조 모서리를 누르세요."
  },
  wall_right_corner: {
    label: "벽 우측 모서리",
    anchorKind: "wall_right_corner",
    idPrefix: "wall-right-corner",
    help: "같은 구조선 기준으로 오른쪽 벽 코너를 누르세요."
  }
};

const NEXT_ANCHOR_PRESET = {
  window_left_top: "window_right_top",
  window_right_top: "window_left_top",
  window_left_bottom: "window_right_bottom",
  window_right_bottom: "window_left_bottom",
  wall_left_corner: "wall_right_corner",
  wall_right_corner: "wall_left_corner"
};

function getSelectedAnchorPreset() {
  return UI_ANCHOR_PRESETS[selectedAnchorPreset] ?? UI_ANCHOR_PRESETS.window_left_top;
}

function getPlacementLabel(mode) {
  if (mode === "anchor") {
    return "기준점 배치 중";
  }
  if (mode === "observed") {
    return "관측 요소 배치 중";
  }
  return "배치 모드 없음";
}

function renderAnchorPresetUI() {
  for (const button of document.querySelectorAll("[data-anchor-preset]")) {
    button.classList.toggle("is-active", button.dataset.anchorPreset === selectedAnchorPreset);
  }

  const help = document.querySelector("#anchor-preset-help");
  if (!help) {
    return;
  }

  const preset = getSelectedAnchorPreset();
  help.textContent = `선택된 기준점: ${preset.label}. ${preset.help}`;
}

function renderNextActionCard(scenario = parseScenario()) {
  const title = document.querySelector("#next-action-title");
  const body = document.querySelector("#next-action-body");
  if (!title || !body) {
    return;
  }

  const state = getWorkflowState(scenario);
  const preset = getSelectedAnchorPreset();

  if (placementMode === "anchor") {
    title.textContent = `${preset.label} 위치를 누르세요.`;
    body.textContent = `${preset.help} 첫 점과 둘째 점은 같은 구조선에서 짝을 맞춰야 합니다.`;
    return;
  }

  if (placementMode === "observed") {
    title.textContent = "사진에서 실제로 보이는 대상을 누르세요.";
    body.textContent = "스위치, 박스, 마감 요소처럼 지금 보이는 대상의 중심 위치를 찍으면 됩니다.";
    return;
  }

  if (state.anchorCount === 0) {
    title.textContent = "창호 기준이면 좌상단부터 시작하세요.";
    body.textContent = "빠른 시작을 누르면 창호 좌상단 기준점 배치로 바로 들어갑니다. 벽 기준이면 벽 코너 시작을 눌러도 됩니다.";
    return;
  }

  if (state.anchorCount === 1) {
    const nextPresetKey = NEXT_ANCHOR_PRESET[selectedAnchorPreset] ?? selectedAnchorPreset;
    const nextPreset = ANCHOR_PRESETS[nextPresetKey] ?? preset;
    title.textContent = "두 번째 기준점을 이어서 잡으세요.";
    body.textContent = `첫 점과 같은 구조선의 짝을 찍어야 합니다. 다음 추천은 ${nextPreset.label}입니다.`;
    return;
  }

  if (!state.hasObservedElements) {
    title.textContent = "이제 보이는 대상을 하나 이상 찍으세요.";
    body.textContent = "기준점은 준비됐습니다. 사진에서 실제로 보이는 대상의 중심을 눌러 주세요.";
    return;
  }

  if (!lastRunResult) {
    title.textContent = "이제 후보 찾기를 누르세요.";
    body.textContent = "준비가 끝났습니다. 빠짐, 추가, 위치 차이 후보를 계산할 수 있습니다.";
    return;
  }

  title.textContent = "후보를 검토하고 다음 사진으로 넘어가세요.";
  body.textContent = "오른쪽 후보 카드에서 확인, 반려, 보류를 남기고 다음 구간으로 진행하면 됩니다.";
}

function renderDrawingExtraction(result = lastDrawingExtraction) {
  const summaryRoot = document.querySelector("#drawing-extraction-summary");
  const candidateRoot = document.querySelector("#drawing-anchor-candidates");

  if (!summaryRoot || !candidateRoot) {
    return;
  }

  summaryRoot.innerHTML = "";
  candidateRoot.innerHTML = "";

  if (!result) {
    summaryRoot.innerHTML = "<p>아직 도면 구조를 읽지 않았습니다.</p>";
    candidateRoot.innerHTML = '<p class="empty-state">추출된 기준점 후보가 여기에 표시됩니다.</p>';
    return;
  }

  const summaryCard = document.createElement("article");
  summaryCard.className = "checkpoint-card";
  summaryCard.innerHTML = `
    <strong>SVG 추출 완료</strong>
    <p>선분: ${result.segmentCount}개</p>
    <p>코너: ${result.cornerCount}개</p>
    <p>앵커 후보: ${result.anchorCandidates.length}개</p>
  `;
  summaryRoot.appendChild(summaryCard);

  const candidates = result.anchorCandidates.slice(0, 8);

  for (const candidate of candidates) {
    const article = document.createElement("article");
    article.className = "drawing-anchor-card";
    article.innerHTML = `
      <strong>${candidate.anchorKind}</strong>
      <p>ID: ${candidate.anchorId}</p>
      <p>좌표: (${candidate.point.x}, ${candidate.point.y})</p>
      <p>출처: ${candidate.sourceType} / ${candidate.sourceId}</p>
      <button type="button">기준점으로 추가</button>
    `;
    article.querySelector("button").addEventListener("click", () => {
      addDrawingAnchorCandidate(candidate);
    });
    candidateRoot.appendChild(article);
  }
}

function addDrawingAnchorCandidate(candidate) {
  const scenario = updateScenario((draft) => {
    const nextIndex = draft.anchors.length + 1;
    draft.anchors.push({
      anchorId: candidate.anchorId ?? `drawing-anchor-${nextIndex}`,
      segmentId: draft.segment.segmentId,
      anchorKind: candidate.anchorKind ?? "drawing_corner",
      geometryType: "point",
      drawingReference: { point: candidate.point },
      fieldObservation: { point: candidate.point },
      stabilityScore: 0.7,
      visibilityState: "visible"
    });
  });

  renderScenarioValidation(scenario);
  renderFormBuilder();
  renderCanvas({ scenario, result: lastRunResult });
  setFlash(`도면 기준점 후보 ${candidate.anchorId}를 시나리오 기준점으로 추가했습니다.`);
}

async function extractDrawingStructure() {
  const input = document.querySelector("#drawing-svg-input");
  const source = input?.value?.trim() ?? "";

  if (!source) {
    setFlash("SVG 도면 텍스트를 먼저 넣어 주세요.", true);
    return;
  }

  saveDrawingSource();

  const result = isLocalShellMode()
    ? extractDrawingStructureFromSvg(source)
    : await (async () => {
        const response = await fetch("/api/engine/drawing/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: stringify({
            format: "svg",
            source
          })
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "도면 구조 추출에 실패했습니다.");
        }

        return payload;
      })();

  lastDrawingExtraction = result;
  renderDrawingExtraction(result);
  setFlash(`도면에서 기준점 후보 ${result.anchorCandidates.length}개를 찾았습니다.`);
}

function renderRatioSummary(scenario = parseScenario()) {
  const root = document.querySelector("#ratio-summary");
  if (!root) {
    return;
  }

  root.innerHTML = "";

  if (!scenario.checkpoints?.length) {
    root.innerHTML = "<p>체크포인트가 아직 없습니다. 체크포인트를 추가하면 기준 비율이 여기에 표시됩니다.</p>";
    return;
  }

  if (scenario.metricCalibration?.knownDistanceMm) {
    const calibration = document.createElement("article");
    calibration.className = "checkpoint-card";
    calibration.innerHTML = `
      <strong>실측 기준</strong>
      <p>기준점 쌍: ${(scenario.metricCalibration.referenceAnchorBasis ?? []).join(" -> ")}</p>
      <p>기준 길이: ${scenario.metricCalibration.knownDistanceMm} mm</p>
    `;
    root.appendChild(calibration);
  }

  for (const checkpoint of scenario.checkpoints) {
    const article = document.createElement("article");
    article.className = "checkpoint-card";
    article.innerHTML = `
      <strong>${checkpoint.checkpointId}</strong>
      <p>기준점 쌍: ${(checkpoint.anchorBasis ?? []).join(" -> ") || "없음"}</p>
      <p>가로 비율(spanRatio): ${checkpoint.normalizedPosition?.spanRatio ?? "n/a"}</p>
      <p>세로 비율(heightRatio): ${checkpoint.normalizedPosition?.heightRatio ?? "n/a"}</p>
      <p>기대 요소: ${checkpoint.semanticExpectation ?? "n/a"}</p>
    `;
    root.appendChild(article);
  }
}

function renderFieldGuide(scenario = parseScenario()) {
  const title = document.querySelector("#field-guide-title");
  const body = document.querySelector("#field-guide-body");
  if (!title || !body) {
    return;
  }

  const anchorCount = scenario.anchors?.length ?? 0;
  const observedCount = scenario.observedElements?.length ?? 0;
  const preset = getSelectedAnchorPreset();
  let activeStep = "anchors";

  if (placementMode === "anchor") {
    activeStep = "anchors";
    if (anchorCount === 0) {
      title.textContent = "첫 번째 기준점을 찍으세요.";
      body.textContent = `${preset.label} 기준점을 잡는 단계입니다. ${preset.help} 같은 구조에서 두 번째 기준점도 이어서 잡아야 비율이 의미를 가집니다.`;
    } else if (anchorCount === 1) {
      title.textContent = "두 번째 기준점을 찍으세요.";
      body.textContent = `첫 번째 기준점과 같은 구조선에 있는 짝을 찍어야 합니다. 예를 들어 좌상단을 찍었다면 같은 프레임의 우상단을 찍는 식으로 맞추세요. ${preset.help}`;
    } else {
      title.textContent = "기준점은 충분합니다.";
      body.textContent = "이제 사진에서 실제로 보이는 대상만 찍으면 됩니다. 스위치 박스나 노출된 박스처럼 비교할 대상을 표시하세요.";
    }
  } else if (placementMode === "observed") {
    activeStep = "observed";
    title.textContent = "보이는 대상을 찍으세요.";
    body.textContent = "사진에서 실제로 보이는 스위치, 박스, 마감 요소를 찍습니다. 기준점과 다르게 움직일 수 있는 대상이어도 괜찮습니다.";
  } else if (anchorCount < 2) {
    activeStep = "anchors";
    title.textContent = "먼저 기준점 두 개를 잡으세요.";
    body.textContent = "문틀 끝, 창호 바깥 프레임 모서리, 벽 코너처럼 잘 안 바뀌는 구조점을 고르세요. 같은 구조 기준에서 두 점을 잡는 것이 중요합니다.";
  } else if (observedCount === 0) {
    activeStep = "observed";
    title.textContent = "이제 보이는 대상을 찍으세요.";
    body.textContent = "기준점은 잡혔습니다. 사진에서 실제로 확인되는 대상만 표시한 뒤 후보 찾기를 누르면 됩니다.";
  } else if (!lastRunResult) {
    activeStep = "run";
    title.textContent = "후보 찾기를 누르세요.";
    body.textContent = "엔진이 빠짐, 추가, 위치 차이 후보를 계산합니다. 결과는 오른쪽 후보 검토 카드에 나타납니다.";
  } else {
    activeStep = "run";
    title.textContent = "후보가 생성되었습니다.";
    body.textContent = "후보 카드를 누르면 같은 위치가 캔버스에서 강조됩니다. 확인, 반려, 보류로 검토를 남길 수 있습니다.";
  }

  for (const chip of document.querySelectorAll("[data-step-chip]")) {
    chip.classList.toggle("is-active", chip.dataset.stepChip === activeStep);
  }
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
    screenName === "engine" ? "비교" : screenName === "workspace" ? "검토" : "홈";
}

function getCandidateTypeLabel(candidateType) {
  return candidateType === "missing"
    ? "누락"
    : candidateType === "extra"
      ? "추가"
      : candidateType === "position_diff"
        ? "위치 차이"
        : candidateType;
}

function getReviewStatusLabel(status) {
  return status === "confirm"
    ? "확인"
    : status === "reject"
      ? "반려"
      : status === "hold"
        ? "보류"
        : "미검토";
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
      detail: "지금 비교 중인 국소 구간입니다."
    },
    {
      label: "기준점",
      value: result.activeAnchors.map((anchor) => anchor.anchorId).join(", "),
      detail: "이번 정합에서 실제로 사용된 기준점 쌍입니다."
    },
    {
      label: "정합",
      value: result.alignmentModel,
      detail: `${result.alignmentQuality.status} / score ${result.alignmentQuality.score.toFixed(2)}`
    },
    {
      label: "실측 환산",
      value: result.metricFrame
        ? `${result.metricFrame.knownDistanceMm}mm 기준`
        : "미설정",
      detail: result.metricFrame
        ? `1px = ${result.metricFrame.millimetersPerPixel.toFixed(2)}mm`
        : "기준 길이를 넣으면 mm 환산이 활성화됩니다."
    },
    {
      label: "결과",
      value: `예상 위치 ${result.projectedCheckpoints.length}개 / 후보 ${result.candidates.length}개`,
      detail: "이번 비교에서 계산된 예상 위치와 확인 후보 수입니다."
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
  const scenario = parseScenario();
  const root = document.querySelector("#projected-checkpoints");
  root.innerHTML = "";

  if (!result.projectedCheckpoints.length) {
    root.innerHTML = "<p>아직 예상 위치가 없습니다.</p>";
    return;
  }

  for (const checkpoint of result.projectedCheckpoints) {
    const sourceCheckpoint = scenario.checkpoints.find(
      (entry) => entry.checkpointId === checkpoint.checkpointId
    );
    const article = document.createElement("article");
    article.className = "checkpoint-card";
    article.innerHTML = `
      <strong>${checkpoint.checkpointId}</strong>
      <p>기대 요소: ${checkpoint.semanticExpectation}</p>
      <p>기준점 쌍: ${sourceCheckpoint?.anchorBasis?.join(" -> ") || "없음"}</p>
      <p>가로 비율: ${sourceCheckpoint?.normalizedPosition?.spanRatio ?? "n/a"}</p>
      <p>세로 비율: ${sourceCheckpoint?.normalizedPosition?.heightRatio ?? "n/a"}</p>
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
    empty.textContent = "현재 시나리오에서는 아직 후보가 생성되지 않았습니다.";
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
        <strong>${getCandidateTypeLabel(candidate.candidateType)}</strong>
        <span class="tag">${candidate.reasonCode}</span>
      </div>
      <p>체크포인트: ${candidate.checkpointId ?? "none"}</p>
      <p>사용 기준점: ${candidate.activeAnchors.join(", ")}</p>
      <p>검토 힌트: ${candidate.reviewHint}</p>
      <p>근거 영역 ID: ${candidate.evidenceRegion.evidenceId}</p>
      <div class="review-badge">상태: ${getReviewStatusLabel(review.status)}</div>
      <div class="review-actions">
        <button type="button" data-review-status="confirm">확인</button>
        <button type="button" data-review-status="reject">반려</button>
        <button type="button" data-review-status="hold">보류</button>
      </div>
      <label class="review-note">
        메모
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
    ["확인", counts.confirm],
    ["반려", counts.reject],
    ["보류", counts.hold]
  ];

  for (const [label, value] of items) {
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <span>${label}</span>
      <strong>${value}</strong>
      <p>현재 후보 검토 집계입니다.</p>
    `;
    grid.appendChild(card);
  }

  root.appendChild(grid);
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
      "<p>입력 점검 통과. 현재 초안은 최소 엔진 입력 규칙을 만족합니다.</p>";
    return;
  }

  for (const issue of issues) {
    const article = document.createElement("article");
    article.className = "summary-card";
    article.innerHTML = `
      <span>${issue.level}</span>
      <strong>${issue.message}</strong>
      <p>엔진 결과를 신뢰하기 전에 이 항목을 먼저 정리하세요.</p>
    `;
    root.appendChild(article);
  }
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
      "<p>후보 카드를 누르면 근거 좌표와 사용 기준점이 여기에 표시됩니다.</p>";
    return;
  }

  const review = currentReviewSession.reviews.find(
    (entry) => entry.candidateId === candidate.candidateId
  );
  const article = document.createElement("article");
  article.className = "checkpoint-card";
  article.innerHTML = `
    <strong>${candidate.candidateId}</strong>
    <p>유형: ${getCandidateTypeLabel(candidate.candidateType)}</p>
    <p>체크포인트: ${candidate.checkpointId ?? "none"}</p>
    <p>이유 코드: ${candidate.reasonCode}</p>
    <p>근거 중심: (${candidate.evidenceRegion.center.x}, ${candidate.evidenceRegion.center.y})</p>
    <p>근거 반경: ${candidate.evidenceRegion.radius}</p>
    <p>사용 기준점: ${candidate.activeAnchors.join(", ")}</p>
    <p>실측 오차: ${candidate.metricOffset?.offsetDistanceMm?.toFixed(1) ?? "n/a"} mm</p>
    <p>검토 상태: ${getReviewStatusLabel(review?.status ?? "unreviewed")}</p>
    <p>메모: ${review?.note?.trim() || "없음"}</p>
  `;
  root.appendChild(article);
}

function addAnchorAtPoint(point) {
  const preset = getSelectedAnchorPreset();
  const scenario = updateScenario((draft) => {
    const sameKindCount = draft.anchors.filter(
      (anchor) => anchor.anchorKind === preset.anchorKind
    ).length;
    draft.anchors.push({
      anchorId: `${preset.idPrefix}-${sameKindCount + 1}`,
      segmentId: draft.segment.segmentId,
      anchorKind: preset.anchorKind,
      geometryType: "point",
      drawingReference: { point: { x: 0, y: 0 } },
      fieldObservation: { point },
      stabilityScore: 0.8,
      visibilityState: "visible"
    });
  });

  setSelectedBuilderEntity("anchor", scenario.anchors.at(-1)?.anchorId, { scroll: true });
  renderScenarioValidation(scenario);
  renderSelectedCandidateDetail(lastRunResult);
  const state = getWorkflowState(scenario);

  if (state.anchorCount === 1) {
    const nextPresetKey = NEXT_ANCHOR_PRESET[selectedAnchorPreset] ?? selectedAnchorPreset;
    setAnchorPreset(nextPresetKey);
    renderCanvas({ scenario, result: lastRunResult });
    setFlash(
      `${preset.label} 기준점을 추가했습니다. 이제 ${getSelectedAnchorPreset().label} 기준점을 찍어 주세요.`
    );
    return;
  }

  if (state.anchorCount === 2 && !state.hasObservedElements) {
    setPlacementMode("observed");
    renderCanvas({ scenario, result: lastRunResult });
    setFlash("기준점 두 개를 잡았습니다. 이제 사진에서 실제로 보이는 대상을 찍어 주세요.");
    return;
  }

  setPlacementMode("none");
  renderCanvas({ scenario, result: lastRunResult });
  setFlash(`${preset.label} 기준점을 (${point.x}, ${point.y})에 추가했습니다.`);
}

function addObservedAtPoint(point) {
  const scenario = updateScenario((draft) => {
    const observedIndex = draft.observedElements.length + 1;
    draft.observedElements.push({
      elementId: `observed-${observedIndex}`,
      segmentId: draft.segment.segmentId,
      elementKind: "switch_box",
      point
    });
  });

  setPlacementMode("none");
  setSelectedBuilderEntity("observed", scenario.observedElements.at(-1)?.elementId, {
    scroll: true
  });
  renderScenarioValidation(scenario);
  renderSelectedCandidateDetail(lastRunResult);
  setFlash(`보이는 대상을 (${point.x}, ${point.y})에 추가했습니다. 이제 후보 찾기를 누르세요.`);
}

function resetOutputPanels() {
  selectedCandidateId = null;
  document.querySelector("#output").textContent = "No output yet.";
  document.querySelector("#candidate-cards").innerHTML =
    '<p class="empty-state">아직 후보가 없습니다.</p>';
  document.querySelector("#projected-checkpoints").innerHTML =
    "<p>아직 예상 위치가 없습니다.</p>";
  document.querySelector("#review-summary").innerHTML =
    "<p>아직 검토 요약이 없습니다.</p>";
  document.querySelector("#engine-summary").innerHTML =
    "<p>후보 찾기를 누르면 비교 결과가 여기에 표시됩니다.</p>";
  document.querySelector("#metric-candidate-count").textContent = "0";
  const detail = document.querySelector("#candidate-detail");
  if (detail) {
    detail.innerHTML =
      "<p>후보 카드를 누르면 근거 좌표와 사용 기준점이 여기에 표시됩니다.</p>";
  }
}

function renderCanvas({ scenario, result }) {
  if (!window.Konva) {
    document.querySelector("#visual-caption").textContent =
      "Konva가 로드되지 않아 오버레이를 그릴 수 없습니다.";
    renderPlacementStatus();
    return;
  }

  const currentStage = stage ?? createStage();
  currentStage.destroyChildren();

  const layer = new window.Konva.Layer();
  const background = new window.Konva.Rect({
    x: 0,
    y: 0,
    width: currentStage.width(),
    height: currentStage.height(),
    fill: "rgba(255, 255, 255, 0.08)"
  });
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

  layer.add(background);

  const anchorPoints = (scenario.anchors ?? []).map((anchor, index) => ({
    anchor,
    index,
    point: projector.project(anchor.fieldObservation.point)
  }));

  if (anchorPoints.length >= 2) {
    layer.add(
      new window.Konva.Line({
        points: anchorPoints.flatMap((entry) => [entry.point.x, entry.point.y]),
        stroke: "#111827",
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
      fill: "#111827",
      draggable: true
    });
    circle.on("dragend", () => {
      const nextPoint = projector.invert(circle.position());
      applyDraggedPoint("anchor", entry.index, nextPoint);
    });
    layer.add(circle);
    drawLabel(layer, entry.anchor.anchorId, entry.point, "#111827");
  }

  for (const [index, element] of (scenario.observedElements ?? []).entries()) {
    const point = projector.project(element.point);
    const rect = new window.Konva.Rect({
      x: point.x - 10,
      y: point.y - 10,
      width: 20,
      height: 20,
      cornerRadius: 5,
      fill: "#8b5e3c",
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
    drawLabel(layer, element.elementId, point, "#8b5e3c");
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
        stroke: "#93c5fd",
        dash: [8, 6],
        strokeWidth: 2
      })
    );
    layer.add(
      new window.Konva.Circle({
        x: point.x,
        y: point.y,
        radius,
        stroke: "#2563eb",
        strokeWidth: 2
      })
    );
    layer.add(
      new window.Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 6,
        fill: "#2563eb"
      })
    );
    drawLabel(layer, checkpoint.checkpointId, point, "#2563eb");
  }

  for (const candidate of result?.candidates ?? []) {
    const center = candidate.evidenceRegion?.center;
    if (!center) {
      continue;
    }

    const point = projector.project(center);
    const color =
      candidate.candidateType === "missing"
        ? "#e11d48"
        : candidate.candidateType === "position_diff"
          ? "#2563eb"
          : "#b7791f";

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
          stroke: "#f59e0b",
          strokeWidth: 4,
          dash: [10, 6]
        })
      );
      layer.add(
        new window.Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 6,
          fill: "#f59e0b"
        })
      );
    }

    drawLabel(layer, candidate.candidateType, point, color);
  }

  if (placementMode !== "none") {
    const preset = getSelectedAnchorPreset();
    const placementLabel = new window.Konva.Label({
      x: 18,
      y: 18,
      opacity: 0.96,
      listening: false
    });
    placementLabel.add(
      new window.Konva.Tag({
        fill: "rgba(17, 17, 17, 0.92)",
        cornerRadius: 999
      })
    );
    placementLabel.add(
      new window.Konva.Text({
        text:
          placementMode === "anchor"
            ? `${preset.label} 위치를 누르세요`
            : "보이는 대상 위치를 누르세요",
        fontFamily: "Avenir Next",
        fontSize: 14,
        padding: 10,
        fill: "#ffffff"
      })
    );
    layer.add(placementLabel);
  }

  currentStage.add(layer);
  currentStage.off("click tap");
  currentStage.on("click tap", () => {
    if (placementMode === "none") {
      return;
    }

    const pointer = currentStage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const nextPoint = projector.invert(pointer);
    if (placementMode === "anchor") {
      addAnchorAtPoint(nextPoint);
      return;
    }

    if (placementMode === "observed") {
      addObservedAtPoint(nextPoint);
    }
  });

  const candidateCount = result?.candidates?.length ?? 0;
  const scenarioName =
    getScenarioMetadata().name || scenario.segment?.label || scenario.segment?.segmentId;
  const baseCaption = result
    ? `${scenarioName}: ${candidateCount}개의 후보가 생성되었습니다. 후보 카드를 누르면 같은 위치가 캔버스에서 강조됩니다.`
    : `${scenarioName}: 기준점과 관측 요소를 드래그해서 위치를 다듬을 수 있습니다.`;
  const placementHint =
    placementMode === "anchor"
      ? ` ${getSelectedAnchorPreset().help}`
      : placementMode === "observed"
        ? " 사진에서 실제로 보이는 대상의 위치를 누르세요."
        : "";
  document.querySelector("#visual-caption").textContent = `${baseCaption}${placementHint}`;
  renderPlacementStatus();
  renderFieldGuide(scenario);
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
    setFlash("후보 계산이 완료되었습니다.");
  } catch (error) {
    document.querySelector("#engine-status").textContent = "Error";
    document.querySelector("#engine-status-detail").textContent = error.message;
    setFlash(error.message, true);
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
    card.dataset.builderKind = "anchor";
    card.dataset.builderId = anchor.anchorId;
    card.innerHTML = `
      <h5>기준점 ${index + 1}</h5>
      <p class="form-card-copy">비교 기준이 되는 구조점입니다.</p>
      <div class="builder-grid builder-grid-two"></div>
      <div class="form-card-actions"><button type="button">삭제</button></div>
    `;
    const grid = card.querySelector(".builder-grid");
    grid.appendChild(
      createLabeledInput("기준점 ID", anchor.anchorId, (event) => {
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
      setFlash(`기준점 ${anchor.anchorId}를 삭제했습니다.`);
    });
    card.addEventListener("click", () => {
      setSelectedBuilderEntity("anchor", anchor.anchorId);
    });
    anchorRoot.appendChild(card);
  });

  const checkpointRoot = document.querySelector("#checkpoint-form-list");
  checkpointRoot.innerHTML = "";
  scenario.checkpoints.forEach((checkpoint, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.dataset.builderKind = "checkpoint";
    card.dataset.builderId = checkpoint.checkpointId;
    card.innerHTML = `
      <h5>체크포인트 ${index + 1}</h5>
      <p class="form-card-copy">기준점 쌍을 기준으로 계산되는 예상 위치입니다.</p>
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
        "허용 반경 비율",
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
        "탐색 반경 비율",
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
      `기준점 쌍: ${checkpoint.anchorBasis.join(", ") || "없음"}`;
    card.querySelector("button").addEventListener("click", () => {
      updateScenario((draft) => {
        draft.checkpoints.splice(index, 1);
      });
      setFlash(`체크포인트 ${checkpoint.checkpointId}를 삭제했습니다.`);
    });
    card.addEventListener("click", () => {
      setSelectedBuilderEntity("checkpoint", checkpoint.checkpointId);
    });
    checkpointRoot.appendChild(card);
  });

  const observedRoot = document.querySelector("#observed-form-list");
  observedRoot.innerHTML = "";
  scenario.observedElements.forEach((element, index) => {
    const card = document.createElement("article");
    card.className = "form-card";
    card.dataset.builderKind = "observed";
    card.dataset.builderId = element.elementId;
    card.innerHTML = `
      <h5>관측 요소 ${index + 1}</h5>
      <p class="form-card-copy">사진에서 실제로 보이는 요소 위치입니다.</p>
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
    card.addEventListener("click", () => {
      setSelectedBuilderEntity("observed", element.elementId);
    });
    observedRoot.appendChild(card);
  });

  renderBuilderSelection();
}

*/
function init() {
  const saved = loadScenario();
  document.querySelector("#scenario-id-input").value = saved.metadata.id;
  document.querySelector("#scenario-title-input").value = saved.metadata.name;
  document.querySelector("#scenario-description-input").value =
    saved.metadata.description;
  document.querySelector("#engine-scenario-input").value = saved.scenarioText;
  document.querySelector("#drawing-svg-input").value = loadDrawingSource();
  renderAnchorPresetUI();
  renderPlacementStatus();
  renderScenarioValidation(parseScenario());
  renderMetrics();
  resetOutputPanels();
  bindEvents();
  document
    .querySelector("[data-action='place-observed']")
    .addEventListener("click", () => {
      setFlash("사진에서 실제로 보이는 대상의 위치를 누르세요.");
    });
  renderFormBuilder();
  renderDrawingExtraction();
  renderCanvas({ scenario: parseScenario(), result: null });
  void loadReviewSession();
  void listSavedScenarios();
}

init();
