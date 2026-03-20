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
let placementMode = "none";
let selectedBuilderEntity = null;

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
    return "앵커 배치 모드";
  }
  if (mode === "observed") {
    return "관측 요소 배치 모드";
  }
  return "배치 모드 없음";
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

function renderFieldGuide(scenario = parseScenario()) {
  const title = document.querySelector("#field-guide-title");
  const body = document.querySelector("#field-guide-body");
  if (!title || !body) {
    return;
  }

  const anchorCount = scenario.anchors?.length ?? 0;
  const observedCount = scenario.observedElements?.length ?? 0;
  let activeStep = "anchors";

  if (placementMode === "anchor") {
    activeStep = "anchors";
    if (anchorCount === 0) {
      title.textContent = "첫 번째 기준점을 찍으세요.";
      body.textContent =
        "기준점은 문틀 끝이나 벽 모서리처럼 잘 안 바뀌는 위치입니다. 사진에서 가장 잘 보이는 기준점 하나를 누르세요.";
    } else if (anchorCount === 1) {
      title.textContent = "두 번째 기준점을 찍으세요.";
      body.textContent =
        "첫 번째 기준점과 떨어진 다른 기준점을 찍으세요. 기준점이 두 개 있어야 도면 기준을 현장에 맞출 수 있습니다.";
    } else {
      title.textContent = "새 기준점을 추가하는 중입니다.";
      body.textContent =
        "이미 기준점이 충분히 있으면 더 찍지 않아도 됩니다. 꼭 필요한 추가 기준점이 있을 때만 누르세요.";
    }
  } else if (placementMode === "observed") {
    activeStep = "observed";
    title.textContent = "현장에서 실제로 보이는 대상을 찍으세요.";
    body.textContent =
      "예를 들면 스위치 박스, 콘센트 박스, 노출된 포인트처럼 사진에서 실제로 확인되는 대상을 누르면 됩니다.";
  } else if (anchorCount < 2) {
    activeStep = "anchors";
    title.textContent = "먼저 기준점 2개를 잡으세요.";
    body.textContent =
      "기준점은 문틀 끝이나 벽 모서리처럼 잘 안 바뀌는 위치입니다. 왼쪽 하나, 오른쪽 하나처럼 서로 떨어진 두 점을 먼저 잡으세요.";
  } else if (observedCount === 0) {
    activeStep = "observed";
    title.textContent = "이제 현장에서 보이는 대상을 찍으세요.";
    body.textContent =
      "기준점은 준비됐습니다. 이제 사진에서 실제로 보이는 스위치나 박스 같은 대상을 눌러 위치를 기록하세요.";
  } else if (!lastRunResult) {
    activeStep = "run";
    title.textContent = "이제 후보 찾기를 누르세요.";
    body.textContent =
      "기준점과 보이는 대상이 준비됐습니다. 이제 후보 찾기를 눌러 빠짐, 추가, 위치 차이 후보를 계산하세요.";
  } else {
    activeStep = "run";
    title.textContent = "오른쪽 후보 카드에서 결과를 검토하세요.";
    body.textContent =
      "후보를 누르면 근거가 보입니다. 맞으면 확정, 아니면 반려, 판단이 어려우면 보류로 표시하면 됩니다.";
  }

  for (const chip of document.querySelectorAll("[data-step-chip]")) {
    chip.classList.toggle("is-active", chip.dataset.stepChip === activeStep);
  }
}

function setPlacementMode(mode) {
  placementMode = mode;
  renderPlacementStatus();
  renderFieldGuide();
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
    screenName === "engine" ? "현장 비교" : screenName === "workspace" ? "운영" : "시작";
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
  const scenario = updateScenario((draft) => {
    const anchorIndex = draft.anchors.length + 1;
    draft.anchors.push({
      anchorId: `anchor-${anchorIndex}`,
      segmentId: draft.segment.segmentId,
      anchorKind: "wall_corner",
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
  setFlash(`Added a new anchor at (${point.x}, ${point.y}).`);
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
  setFlash(`Added a new observed element at (${point.x}, ${point.y}).`);
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
            ? "Tap anywhere to place the next anchor"
            : "Tap anywhere to place the next observed element",
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
    ? `${scenarioName}: rendered ${candidateCount} candidates. Select a card to highlight the same location on the canvas.`
    : `${scenarioName}: drag anchors and observed elements to refine their positions.`;
  const placementHint =
    placementMode === "anchor"
      ? " Tap an empty area to place a new anchor."
      : placementMode === "observed"
        ? " Tap an empty area to place a new observed element."
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

  for (const button of document.querySelectorAll("[data-action='run-engine']")) {
    button.addEventListener("click", runEngine);
  }

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
      setFlash("Tap an empty area to place a new anchor.");
    });

  document
    .querySelector("[data-action='place-observed']")
    .addEventListener("click", () => {
      setPlacementMode("observed");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash("Tap an empty area to place a new observed element.");
    });

  document
    .querySelector("[data-action='cancel-placement']")
    .addEventListener("click", () => {
      setPlacementMode("none");
      renderCanvas({ scenario: parseScenario(), result: lastRunResult });
      setFlash("Placement mode cleared.");
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

function init() {
  const saved = loadScenario();
  document.querySelector("#scenario-id-input").value = saved.metadata.id;
  document.querySelector("#scenario-title-input").value = saved.metadata.name;
  document.querySelector("#scenario-description-input").value =
    saved.metadata.description;
  document.querySelector("#engine-scenario-input").value = saved.scenarioText;
  renderPlacementStatus();
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
