const workspaceInput = document.querySelector("#workspace-input");
const recordStartInput = document.querySelector("#record-start-input");
const itemInput = document.querySelector("#item-input");
const recordIdInput = document.querySelector("#record-id");
const listProjectIdInput = document.querySelector("#list-project-id");
const output = document.querySelector("#output");
const projectsList = document.querySelector("#projects-list");
const recordsList = document.querySelector("#records-list");
const reportsList = document.querySelector("#reports-list");
const workspaceSummary = document.querySelector("#workspace-summary");
const recordSummary = document.querySelector("#record-summary");
const backupSummary = document.querySelector("#backup-summary");
const reportSummary = document.querySelector("#report-summary");
const reportPreview = document.querySelector("#report-preview");
const actionLane = document.querySelector("#action-lane");
const nextActions = document.querySelector("#next-actions");
const selectedProjectName = document.querySelector("#selected-project-name");
const selectedProjectId = document.querySelector("#selected-project-id");
const selectedRecordName = document.querySelector("#selected-record-name");
const selectedRecordId = document.querySelector("#selected-record-id");
const selectionProjectDetail = document.querySelector("#selection-project-detail");
const selectionRecordDetail = document.querySelector("#selection-record-detail");
const selectionProjectScope = document.querySelector("#selection-project-scope");
const selectionRecordState = document.querySelector("#selection-record-state");
const dashboardRecordStatus = document.querySelector("#dashboard-record-status");
const dashboardItemCount = document.querySelector("#dashboard-item-count");
const dashboardReportCount = document.querySelector("#dashboard-report-count");
const dashboardBackupCount = document.querySelector("#dashboard-backup-count");
const projectIdInput = document.querySelector("#project-id-input");
const projectNameInput = document.querySelector("#project-name-input");
const siteNameInput = document.querySelector("#site-name-input");
const baselineUnitInput = document.querySelector("#baseline-unit-input");
const comparisonUnitInput = document.querySelector("#comparison-unit-input");
const spaceNameInput = document.querySelector("#space-name-input");
const checkpointLabelInput = document.querySelector("#checkpoint-label-input");
const recordStartIdInput = document.querySelector("#record-start-id");
const recordProjectIdInput = document.querySelector("#record-project-id");
const recordBaselineIdInput = document.querySelector("#record-baseline-id");
const recordComparisonIdInput = document.querySelector("#record-comparison-id");
const baselineVersionInput = document.querySelector("#baseline-version-input");
const itemRecordIdInput = document.querySelector("#item-record-id");
const itemIdInput = document.querySelector("#item-id-input");
const itemCheckpointIdInput = document.querySelector("#item-checkpoint-id");
const itemSpaceIdInput = document.querySelector("#item-space-id");
const itemResultTypeInput = document.querySelector("#item-result-type");
const itemReviewRequiredInput = document.querySelector("#item-review-required");
const itemNoteInput = document.querySelector("#item-note-input");
const backupIdInput = document.querySelector("#backup-id");
const reportIdInput = document.querySelector("#report-id");

const RESULT_LABELS = {
  missing: "Missing",
  extra: "Extra",
  position_diff: "Position Diff",
  ok: "OK"
};

const state = {
  selectedProjectId: projectIdInput.value.trim(),
  selectedProjectName: projectNameInput.value.trim(),
  selectedRecordId: recordIdInput.value.trim(),
  selectedBackupId: "",
  selectedReportId: "",
  currentWorkspace: null,
  currentRecord: null,
  currentReport: null,
  currentBackups: [],
  currentReports: []
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function summarizeResults(items = []) {
  const counts = {
    missing: 0,
    extra: 0,
    position_diff: 0,
    ok: 0,
    reviewRequired: 0
  };

  for (const item of items) {
    counts[item.resultType] = (counts[item.resultType] ?? 0) + 1;

    if (item.reviewRequired) {
      counts.reviewRequired += 1;
    }
  }

  return counts;
}

function renderOutput(label, payload) {
  output.textContent = `${label}\n\n${JSON.stringify(payload, null, 2)}`;
}

function renderList(container, items, formatter, emptyMessage) {
  container.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const meta = formatter(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-item";
    button.dataset.itemId = item.id;
    button.dataset.itemName = meta.title;
    button.innerHTML = `
      <span class="list-kicker">${escapeHtml(meta.kicker ?? "")}</span>
      <strong>${escapeHtml(meta.title)}</strong>
      <span>${escapeHtml(meta.meta)}</span>
    `;
    container.append(button);
  });
}

function renderWorkspaceSummary(workspace) {
  if (!workspace) {
    workspaceSummary.innerHTML = "<p>No workspace loaded.</p>";
    return;
  }

  const units = workspace.catalog.units
    .map((unit) => `<span class="tag">${escapeHtml(unit.id)} / ${escapeHtml(unit.kind)}</span>`)
    .join("");
  const spaces = workspace.catalog.spaces
    .map((space) => `<span class="tag">${escapeHtml(space.name)}</span>`)
    .join("");
  const checkpoints = workspace.catalog.checkpoints
    .map((checkpoint) => `<span class="tag">${escapeHtml(checkpoint.label)}</span>`)
    .join("");

  workspaceSummary.innerHTML = `
    <article class="summary-card">
      <p class="summary-title">${escapeHtml(workspace.project.name)} <span>${escapeHtml(workspace.project.id)}</span></p>
      <p class="summary-copy">${escapeHtml(workspace.project.siteName ?? "No site name")} / units ${workspace.catalog.units.length} / spaces ${workspace.catalog.spaces.length} / checkpoints ${workspace.catalog.checkpoints.length}</p>
    </article>
    <article class="summary-card">
      <p class="summary-label">Units</p>
      <div class="tag-row">${units || '<span class="tag muted">No units</span>'}</div>
    </article>
    <article class="summary-card">
      <p class="summary-label">Spaces</p>
      <div class="tag-row">${spaces || '<span class="tag muted">No spaces</span>'}</div>
    </article>
    <article class="summary-card">
      <p class="summary-label">Checkpoints</p>
      <div class="tag-row">${checkpoints || '<span class="tag muted">No checkpoints</span>'}</div>
    </article>
  `;
}

function renderRecordSummary(record) {
  if (!record) {
    recordSummary.innerHTML = "<p>No record loaded.</p>";
    return;
  }

  const counts = summarizeResults(record.items);
  const items = record.items
    .map((item) => {
      const checkpoint = item.checkpointId ?? "ad-hoc";
      const note = item.note ? ` / ${item.note}` : "";
      const review = item.reviewRequired ? " / review" : "";
      return `<span class="tag result-${escapeHtml(item.resultType)}">${escapeHtml(item.id)} · ${escapeHtml(item.resultType)} · ${escapeHtml(checkpoint)}${escapeHtml(review)}${escapeHtml(note)}</span>`;
    })
    .join("");

  recordSummary.innerHTML = `
    <article class="summary-card">
      <p class="summary-title">${escapeHtml(record.id)} <span>${escapeHtml(record.status)}</span></p>
      <p class="summary-copy">Baseline ${escapeHtml(record.baselineVersion)} / ${escapeHtml(record.baselineSnapshot.unitName ?? record.baselineSnapshot.unitId)} vs ${escapeHtml(record.comparisonUnitId)}</p>
    </article>
    <article class="summary-card metric-strip">
      <span class="tag result-missing">Missing ${counts.missing}</span>
      <span class="tag result-extra">Extra ${counts.extra}</span>
      <span class="tag result-position_diff">Position ${counts.position_diff}</span>
      <span class="tag ${counts.reviewRequired ? "result-review" : "muted"}">Review ${counts.reviewRequired}</span>
    </article>
    <article class="summary-card">
      <p class="summary-label">Items</p>
      <div class="tag-row">${items || '<span class="tag muted">No inspection items</span>'}</div>
    </article>
  `;
}

function renderBackupSummary(backupDetails) {
  if (!backupDetails) {
    backupSummary.innerHTML = "<p>No backup selected.</p>";
    return;
  }

  backupSummary.innerHTML = `
    <article class="summary-card">
      <p class="summary-title">${escapeHtml(backupDetails.manifest.id)}</p>
      <p class="summary-copy">Projects ${escapeHtml(backupDetails.manifest.projectIds.join(", ") || "-")} / files ${escapeHtml(backupDetails.manifest.fileCount)} / mode ${escapeHtml(backupDetails.manifest.exportMode ?? "-")}</p>
    </article>
  `;
}

function renderReportSummary(reportDetails, record = state.currentRecord) {
  if (!reportDetails) {
    reportSummary.innerHTML = "<p>No report selected.</p>";
    return;
  }

  const report = reportDetails.report ?? reportDetails;
  const counts = summarizeResults(record?.id === report.recordId ? record.items : []);

  reportSummary.innerHTML = `
    <article class="summary-card">
      <p class="summary-title">${escapeHtml(report.id)}</p>
      <p class="summary-copy">Record ${escapeHtml(report.recordId)} / generated ${escapeHtml(formatTimestamp(report.generatedAt))}</p>
    </article>
    <article class="summary-card metric-strip">
      <span class="tag result-missing">Missing ${counts.missing}</span>
      <span class="tag result-extra">Extra ${counts.extra}</span>
      <span class="tag result-position_diff">Position ${counts.position_diff}</span>
      <span class="tag ${counts.reviewRequired ? "result-review" : "muted"}">Review ${counts.reviewRequired}</span>
    </article>
  `;
}

function renderActionLane(record = state.currentRecord) {
  if (!record) {
    actionLane.innerHTML = "<p>No action context yet.</p>";
    return;
  }

  const counts = summarizeResults(record.items);
  const actions = [];

  if (record.status === "draft") {
    actions.push("Add findings, then send the record to review.");
  }

  if (record.status === "in_review") {
    actions.push("Reopen if edits are needed, or finalize when the findings are locked.");
  }

  if (record.status === "finalized") {
    actions.push("Generate a report and export a backup package.");
  }

  if (counts.reviewRequired > 0) {
    actions.push(`${counts.reviewRequired} item(s) still marked for review.`);
  }

  actionLane.innerHTML = `
    <article class="summary-card">
      <p class="summary-title">${escapeHtml(record.id)} workflow</p>
      <p class="summary-copy">${escapeHtml(actions.join(" ") || "No pending actions.")}</p>
    </article>
  `;
}

function renderNextActions(workspace = state.currentWorkspace, record = state.currentRecord) {
  const steps = [];

  if (!workspace) {
    steps.push("1. Create or select a workspace.");
  } else {
    steps.push("1. Workspace selected.");
  }

  if (!record) {
    steps.push("2. Start an inspection record.");
  } else if (record.status === "draft") {
    steps.push("2. Add findings and send review.");
  } else if (record.status === "in_review") {
    steps.push("2. Finalize after review.");
  } else {
    steps.push("2. Generate a report or export backup.");
  }

  nextActions.innerHTML = steps.map((step) => `<p>${escapeHtml(step)}</p>`).join("");
}

function renderReportPreview(reportDetails, record = state.currentRecord) {
  if (!reportDetails) {
    reportPreview.innerHTML = "<p>No report preview loaded.</p>";
    return;
  }

  const report = reportDetails.report ?? reportDetails;
  const project = state.currentWorkspace?.project;
  const activeRecord = record?.id === report.recordId ? record : null;
  const counts = summarizeResults(activeRecord?.items ?? []);
  const grouped = {
    missing: [],
    extra: [],
    position_diff: []
  };

  for (const item of activeRecord?.items ?? []) {
    if (grouped[item.resultType]) {
      grouped[item.resultType].push(item);
    }
  }

  const renderFindingGroup = (type) => {
    const entries = grouped[type];

    if (!entries || entries.length === 0) {
      return `
        <section class="report-section">
          <div class="report-section-head">
            <h4>${escapeHtml(RESULT_LABELS[type])}</h4>
            <span class="tag muted">0</span>
          </div>
          <p class="report-empty">No ${escapeHtml(RESULT_LABELS[type].toLowerCase())} findings.</p>
        </section>
      `;
    }

    const items = entries
      .map((item) => `
        <article class="finding-card finding-${escapeHtml(type)}">
          <div class="finding-topline">
            <strong>${escapeHtml(item.id)}</strong>
            <span class="tag">${escapeHtml(item.checkpointId ?? item.spaceId ?? "ad-hoc")}</span>
          </div>
          <p>${escapeHtml(item.note || "No note recorded.")}</p>
          <div class="finding-meta">
            <span>${escapeHtml(item.resultType)}</span>
            <span>${item.reviewRequired ? "review required" : "ready"}</span>
          </div>
        </article>
      `)
      .join("");

    return `
      <section class="report-section">
        <div class="report-section-head">
          <h4>${escapeHtml(RESULT_LABELS[type])}</h4>
          <span class="tag">${entries.length}</span>
        </div>
        <div class="finding-grid">${items}</div>
      </section>
    `;
  };

  const fallback = escapeHtml(reportDetails.content || "No report preview loaded.");

  reportPreview.innerHTML = activeRecord
    ? `
      <article class="report-document">
        <header class="report-header">
          <div>
            <p class="report-kicker">BaseMark Inspection Report</p>
            <h3>${escapeHtml(project?.name ?? "Project")} / ${escapeHtml(report.recordId)}</h3>
            <p class="report-meta">Generated ${escapeHtml(formatTimestamp(report.generatedAt))} · baseline ${escapeHtml(activeRecord.baselineVersion)} · status ${escapeHtml(activeRecord.status)}</p>
          </div>
          <div class="report-badge-column">
            <span class="tag">${escapeHtml(project?.id ?? "-")}</span>
            <span class="tag">${escapeHtml(activeRecord.baselineSnapshot.unitName ?? activeRecord.baselineUnitId)}</span>
            <span class="tag">${escapeHtml(activeRecord.comparisonUnitId)}</span>
          </div>
        </header>

        <section class="report-summary-grid">
          <article class="report-stat">
            <span>Missing</span>
            <strong>${counts.missing}</strong>
          </article>
          <article class="report-stat">
            <span>Extra</span>
            <strong>${counts.extra}</strong>
          </article>
          <article class="report-stat">
            <span>Position</span>
            <strong>${counts.position_diff}</strong>
          </article>
          <article class="report-stat">
            <span>Review</span>
            <strong>${counts.reviewRequired}</strong>
          </article>
        </section>

        ${renderFindingGroup("missing")}
        ${renderFindingGroup("extra")}
        ${renderFindingGroup("position_diff")}
      </article>
    `
    : `<pre class="report-fallback">${fallback}</pre>`;
}

function syncSelectionView() {
  selectedProjectName.textContent = state.selectedProjectName || "None";
  selectedProjectId.textContent = state.selectedProjectId || "-";
  selectedRecordName.textContent = state.selectedRecordId || "None";
  selectedRecordId.textContent = state.selectedRecordId || "-";

  selectionProjectDetail.textContent =
    state.currentWorkspace?.project?.name ?? state.selectedProjectName ?? "None";
  selectionRecordDetail.textContent =
    state.currentRecord?.id ?? state.selectedRecordId ?? "None";
  selectionProjectScope.textContent = state.currentWorkspace
    ? `${state.currentWorkspace.catalog.units.length} units / ${state.currentWorkspace.catalog.checkpoints.length} checkpoints`
    : "-";
  selectionRecordState.textContent = state.currentRecord
    ? `${state.currentRecord.status} / baseline ${state.currentRecord.baselineVersion}`
    : "-";
}

function syncDashboard() {
  const currentRecord = state.currentRecord;

  if (currentRecord) {
    const counts = summarizeResults(currentRecord.items);
    dashboardRecordStatus.textContent = currentRecord.status;
    dashboardItemCount.textContent = `Items ${currentRecord.items.length} · Review ${counts.reviewRequired}`;
  } else {
    dashboardRecordStatus.textContent = "No record";
    dashboardItemCount.textContent = "Items 0";
  }

  dashboardReportCount.textContent = `Reports ${state.currentReports.length}`;
  dashboardBackupCount.textContent = `Backups ${state.currentBackups.length}`;
}

function setSelectedProject(project) {
  state.selectedProjectId = project.id;
  state.selectedProjectName = project.name;
  listProjectIdInput.value = project.id;
  projectIdInput.value = project.id;
  projectNameInput.value = project.name;
  recordProjectIdInput.value = project.id;
  syncEditors();
  syncSelectionView();
}

function setSelectedRecord(record) {
  state.selectedRecordId = record.id;
  recordIdInput.value = record.id;
  itemRecordIdInput.value = record.id;
  syncEditors();
  syncSelectionView();
}

function setSelectedBackup(backupId) {
  state.selectedBackupId = backupId;
  backupIdInput.value = backupId;
}

function setSelectedReport(reportId) {
  state.selectedReportId = reportId;
  reportIdInput.value = reportId;
}

function buildWorkspacePayload() {
  const projectId = projectIdInput.value.trim();

  return {
    project: {
      id: projectId,
      name: projectNameInput.value.trim(),
      siteName: siteNameInput.value.trim()
    },
    units: [
      {
        id: "unit-baseline",
        projectId,
        name: baselineUnitInput.value.trim(),
        kind: "baseline"
      },
      {
        id: "unit-comparison",
        projectId,
        name: comparisonUnitInput.value.trim(),
        kind: "comparison"
      }
    ],
    spaces: [
      {
        id: "space-1",
        unitId: "unit-baseline",
        name: spaceNameInput.value.trim()
      }
    ],
    checkpoints: [
      {
        id: "cp-1",
        unitId: "unit-baseline",
        spaceId: "space-1",
        label: checkpointLabelInput.value.trim()
      }
    ]
  };
}

function buildRecordPayload() {
  return {
    id: recordStartIdInput.value.trim(),
    projectId: recordProjectIdInput.value.trim(),
    baselineUnitId: recordBaselineIdInput.value.trim(),
    comparisonUnitId: recordComparisonIdInput.value.trim(),
    baselineVersion: baselineVersionInput.value.trim()
  };
}

function buildItemPayload() {
  const resultType = itemResultTypeInput.value;
  const checkpointId = itemCheckpointIdInput.value.trim();

  return {
    recordId: itemRecordIdInput.value.trim(),
    item: {
      id: itemIdInput.value.trim(),
      checkpointId: resultType === "extra" ? undefined : checkpointId,
      spaceId: itemSpaceIdInput.value.trim() || undefined,
      resultType,
      reviewRequired: itemReviewRequiredInput.value === "true",
      note: itemNoteInput.value.trim()
    }
  };
}

function syncEditors() {
  workspaceInput.value = JSON.stringify(buildWorkspacePayload(), null, 2);
  recordStartInput.value = JSON.stringify(buildRecordPayload(), null, 2);
  itemInput.value = JSON.stringify(buildItemPayload(), null, 2);
  recordIdInput.value = itemRecordIdInput.value.trim() || recordIdInput.value;
  listProjectIdInput.value = recordProjectIdInput.value.trim() || listProjectIdInput.value;
}

async function callJson(url, method, payload) {
  const response = await fetch(url, {
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

async function refreshProjects() {
  const projects = await callJson("/api/projects", "GET");
  renderList(
    projectsList,
    projects,
    (project) => ({
      kicker: "Project",
      title: project.name,
      meta: `${project.id}${project.siteName ? ` / ${project.siteName}` : ""}`
    }),
    "No projects saved yet."
  );
  return projects;
}

async function refreshRecords() {
  const projectId = listProjectIdInput.value.trim();
  const records = await callJson(
    `/api/records?projectId=${encodeURIComponent(projectId)}`,
    "GET"
  );
  renderList(
    recordsList,
    records,
    (record) => ({
      kicker: "Record",
      title: record.id,
      meta: `${record.status} / items ${record.items.length}`
    }),
    "No records for the selected project."
  );
  return records;
}

async function refreshBackups() {
  const backups = await callJson("/api/backups", "GET");
  state.currentBackups = backups;

  if (backups.length === 0) {
    renderBackupSummary(null);
  } else if (!state.selectedBackupId) {
    setSelectedBackup(backups[0].id);
  }

  syncDashboard();
  return backups;
}

async function refreshReports() {
  const reports = await callJson(
    `/api/reports?projectId=${encodeURIComponent(listProjectIdInput.value.trim())}`,
    "GET"
  );

  state.currentReports = reports;

  renderList(
    reportsList,
    reports,
    (report) => ({
      kicker: "Report",
      title: report.id,
      meta: `${report.recordId}${report.generatedAt ? ` / ${formatTimestamp(report.generatedAt)}` : ""}`
    }),
    "No reports for the selected project."
  );

  if (reports.length === 0) {
    renderReportSummary(null);
    renderReportPreview(null);
  } else if (
    !state.selectedReportId ||
    !reports.some((report) => report.id === state.selectedReportId)
  ) {
    setSelectedReport(reports[0].id);
  }

  syncDashboard();
  return reports;
}

async function loadCurrentSelection() {
  if (state.selectedProjectId) {
    state.currentWorkspace = await callJson(
      `/api/workspace/show?projectId=${encodeURIComponent(state.selectedProjectId)}`,
      "GET"
    );
    renderWorkspaceSummary(state.currentWorkspace);
  }

  if (state.selectedRecordId) {
    state.currentRecord = await callJson(
      `/api/record/show?recordId=${encodeURIComponent(state.selectedRecordId)}`,
      "GET"
    );
    renderRecordSummary(state.currentRecord);
  }

  renderActionLane();
  renderNextActions();
  syncSelectionView();
  syncDashboard();
}

async function showReport(reportId) {
  const report = await callJson(
    `/api/report/show?reportId=${encodeURIComponent(reportId)}`,
    "GET"
  );

  setSelectedReport(report.report.id);
  state.currentReport = report;

  if (!state.currentRecord || state.currentRecord.id !== report.report.recordId) {
    state.currentRecord = await callJson(
      `/api/record/show?recordId=${encodeURIComponent(report.report.recordId)}`,
      "GET"
    );
  }

  renderRecordSummary(state.currentRecord);
  renderReportSummary(report, state.currentRecord);
  renderReportPreview(report, state.currentRecord);
  renderActionLane();
  renderNextActions();
  syncSelectionView();
  syncDashboard();
  return report;
}
