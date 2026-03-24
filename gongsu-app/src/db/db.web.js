import { parseAndNormalizeBackupImport } from './backupInterop.mjs';

const DEFAULT_SITE = {
  name: '기본 현장',
  unitPrice: 200000,
  color: '#185FA5',
};

const STORAGE_KEY = 'gongsu-web-db-v1';

let cachedState = null;

function getNowIso() {
  return new Date().toISOString();
}

function createDefaultSite(id = 1) {
  return {
    id,
    name: DEFAULT_SITE.name,
    unit_price: DEFAULT_SITE.unitPrice,
    color: DEFAULT_SITE.color,
    created_at: getNowIso(),
  };
}

function createInitialState() {
  return {
    sites: [createDefaultSite()],
    records: [],
    app_settings: {},
    counters: {
      site: 2,
      record: 1,
    },
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function normalizeState(rawState) {
  const fallback = createInitialState();
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const sites = Array.isArray(state.sites) ? state.sites : fallback.sites;
  const records = Array.isArray(state.records) ? state.records : [];
  const appSettings =
    state.app_settings && typeof state.app_settings === 'object' ? state.app_settings : {};

  const maxSiteId = sites.reduce(
    (maxValue, site) =>
      Number.isInteger(Number(site?.id)) ? Math.max(maxValue, Number(site.id)) : maxValue,
    0
  );
  const maxRecordId = records.reduce(
    (maxValue, record) =>
      Number.isInteger(Number(record?.id)) ? Math.max(maxValue, Number(record.id)) : maxValue,
    0
  );

  return {
    sites,
    records,
    app_settings: appSettings,
    counters: {
      site: Math.max(Number(state?.counters?.site) || 1, maxSiteId + 1, 1),
      record: Math.max(Number(state?.counters?.record) || 1, maxRecordId + 1, 1),
    },
  };
}

function loadState() {
  if (cachedState) {
    return cachedState;
  }

  if (!canUseStorage()) {
    cachedState = createInitialState();
    return cachedState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cachedState = normalizeState(raw ? JSON.parse(raw) : null);
  } catch {
    cachedState = createInitialState();
  }

  return cachedState;
}

function saveState(nextState) {
  cachedState = normalizeState(nextState);

  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedState));
  }

  return cachedState;
}

function getStateSnapshot() {
  return cloneValue(loadState());
}

function sortByCreatedAtThenId(items) {
  return [...items].sort((left, right) => {
    const leftCreatedAt = String(left?.created_at ?? '');
    const rightCreatedAt = String(right?.created_at ?? '');

    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt.localeCompare(rightCreatedAt);
    }

    return Number(left?.id ?? 0) - Number(right?.id ?? 0);
  });
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const leftDate = String(left?.date ?? '');
    const rightDate = String(right?.date ?? '');

    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    return Number(left?.id ?? 0) - Number(right?.id ?? 0);
  });
}

function resolveRecord(record, sites) {
  const matchedSite = sites.find((site) => site.id === record.site_id) ?? null;

  return {
    ...record,
    site_name: record.site_name || matchedSite?.name || '미지정 현장',
    site_color: record.site_color || matchedSite?.color || DEFAULT_SITE.color,
  };
}

function normalizeItem(item) {
  return {
    siteId: item.siteId ?? null,
    siteName: String(item.siteName ?? '').trim(),
    siteColor: item.siteColor ?? DEFAULT_SITE.color,
    taskName: String(item.taskName ?? '').trim(),
    gongsu: Number.isFinite(Number(item.gongsu)) ? Number(item.gongsu) : 0,
    unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
  };
}

function normalizeSiteNameKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeRecordText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildRecordSignature(record) {
  return [
    String(record.date ?? '').trim(),
    normalizeSiteNameKey(record.siteName),
    normalizeRecordText(record.taskName),
    Number(record.gongsu ?? 0),
    Number(record.unitPrice ?? 0),
    Number(record.amount ?? 0),
    normalizeRecordText(record.memo),
    Number(record.isSettled ?? 0),
    Number(record.isHoliday ?? 0),
  ].join('|');
}

function createSiteIdFactory(existingSites, importedSites) {
  const usedIds = new Set(
    [...existingSites, ...importedSites]
      .map((site) => Number(site?.id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );

  let nextId = usedIds.size > 0 ? Math.max(...usedIds) + 1 : 1;

  return (preferredId = null) => {
    const numericPreferredId = Number(preferredId);

    if (
      Number.isInteger(numericPreferredId) &&
      numericPreferredId > 0 &&
      !usedIds.has(numericPreferredId)
    ) {
      usedIds.add(numericPreferredId);
      nextId = Math.max(nextId, numericPreferredId + 1);
      return numericPreferredId;
    }

    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    const createdId = nextId;
    usedIds.add(createdId);
    nextId += 1;
    return createdId;
  };
}

function mergeImportedPayload(
  existingSites,
  existingRecords,
  importedSites,
  importedRecords,
  options = {}
) {
  const allowSyntheticSites = options.allowSyntheticSites !== false;
  const pickSiteId = createSiteIdFactory(existingSites, importedSites);
  const siteByName = new Map(
    existingSites
      .filter((site) => normalizeSiteNameKey(site.name))
      .map((site) => [normalizeSiteNameKey(site.name), site])
  );
  const importedSiteIdMap = new Map();
  const sitesToInsert = [];
  const existingRecordSignatures = new Set(existingRecords.map(buildRecordSignature));
  const recordsToInsert = [];

  const ensureSite = (candidate) => {
    const name = String(candidate?.name ?? candidate?.siteName ?? '').trim();
    if (!name) {
      return null;
    }

    const nameKey = normalizeSiteNameKey(name);
    if (siteByName.has(nameKey)) {
      return siteByName.get(nameKey);
    }

    if (!allowSyntheticSites) {
      return null;
    }

    const createdSite = {
      id: pickSiteId(candidate?.id ?? candidate?.siteId ?? null),
      name,
      unitPrice:
        Number(candidate?.unitPrice ?? candidate?.unit_price ?? DEFAULT_SITE.unitPrice) ||
        DEFAULT_SITE.unitPrice,
      color: String(
        candidate?.color ?? candidate?.siteColor ?? candidate?.site_color ?? DEFAULT_SITE.color
      ),
      createdAt: String(candidate?.createdAt ?? candidate?.created_at ?? getNowIso()),
    };

    siteByName.set(nameKey, createdSite);
    sitesToInsert.push(createdSite);
    return createdSite;
  };

  for (const importedSite of importedSites) {
    const resolvedSite = ensureSite(importedSite);
    const importedSiteId = Number(importedSite?.id);

    if (resolvedSite && Number.isInteger(importedSiteId) && importedSiteId > 0) {
      importedSiteIdMap.set(importedSiteId, resolvedSite.id);
    }
  }

  for (const record of importedRecords) {
    const importedSiteId = Number(record.siteId);
    const mappedSiteId =
      Number.isInteger(importedSiteId) && importedSiteIdMap.has(importedSiteId)
        ? importedSiteIdMap.get(importedSiteId)
        : null;
    const resolvedSite =
      mappedSiteId !== null
        ? [...existingSites, ...sitesToInsert].find((site) => site.id === mappedSiteId) ?? null
        : ensureSite({
            id: record.siteId,
            name: record.siteName,
            unitPrice: record.unitPrice,
            color: record.siteColor,
            createdAt: record.createdAt,
          });

    const mergedRecord = {
      ...record,
      id: null,
      siteId: resolvedSite?.id ?? null,
      siteName: record.siteName || resolvedSite?.name || '',
      siteColor: record.siteColor || resolvedSite?.color || DEFAULT_SITE.color,
      unitPrice:
        Number(record.unitPrice) > 0
          ? Number(record.unitPrice)
          : Number(resolvedSite?.unitPrice ?? DEFAULT_SITE.unitPrice),
    };

    const signature = buildRecordSignature(mergedRecord);
    if (existingRecordSignatures.has(signature)) {
      continue;
    }

    existingRecordSignatures.add(signature);
    recordsToInsert.push(mergedRecord);
  }

  return {
    sites: sitesToInsert,
    records: recordsToInsert,
  };
}

function toRecordRow(record, nextId) {
  return {
    id: record.id ?? nextId,
    date: record.date,
    site_id: record.siteId ?? null,
    site_name: record.siteName ?? '',
    site_color: record.siteColor ?? DEFAULT_SITE.color,
    task_name: record.taskName ?? '',
    gongsu: Number(record.gongsu ?? 0),
    unit_price: Number(record.unitPrice ?? 0),
    amount: Math.round(Number(record.amount ?? Number(record.gongsu ?? 0) * Number(record.unitPrice ?? 0))),
    memo: record.memo ?? '',
    is_settled: Number(record.isSettled ?? 0),
    is_holiday: Number(record.isHoliday ?? 0),
    created_at: record.createdAt ?? getNowIso(),
  };
}

function toSiteRow(site, nextId) {
  return {
    id: site.id ?? nextId,
    name: site.name,
    unit_price: Number(site.unitPrice ?? DEFAULT_SITE.unitPrice),
    color: site.color ?? DEFAULT_SITE.color,
    created_at: site.createdAt ?? getNowIso(),
  };
}

async function prepareImportedData(payload, source = {}) {
  if (payload && typeof payload === 'object' && typeof payload.sqliteSourceUri === 'string') {
    throw new Error('웹 미리보기에서는 SQLite 백업 가져오기를 지원하지 않습니다.');
  }

  const imported = parseAndNormalizeBackupImport(payload, {
    defaultSite: DEFAULT_SITE,
    sourceName: source.name,
  });

  if (imported.sites.length === 0 && imported.records.length === 0) {
    throw new Error('No importable sites or records were found. Check whether the file is JSON or CSV/TSV format.');
  }

  return {
    normalizedSites: imported.sites,
    normalizedRecords: imported.records,
    allowSyntheticSites: imported.allowSyntheticSites !== false,
  };
}

export async function getDB() {
  return {
    engine: 'web-localstorage',
  };
}

export async function getAppSetting(key, fallbackValue = null) {
  const state = loadState();
  return state.app_settings[key] ?? fallbackValue;
}

export async function setAppSetting(key, value) {
  const state = getStateSnapshot();
  state.app_settings[key] = value == null ? null : String(value);
  saveState(state);
}

export async function getSites() {
  const state = loadState();
  return sortByCreatedAtThenId(state.sites);
}

export async function addSite(name, unitPrice, color) {
  const state = getStateSnapshot();
  const id = state.counters.site;
  state.counters.site += 1;
  state.sites.push({
    id,
    name,
    unit_price: unitPrice,
    color,
    created_at: getNowIso(),
  });
  saveState(state);
  return id;
}

export async function updateSite(id, name, unitPrice, color) {
  const state = getStateSnapshot();
  const target = state.sites.find((site) => site.id === id);

  if (!target) {
    return;
  }

  state.records = state.records.map((record) => {
    if (record.site_id !== id) {
      return record;
    }

    return {
      ...record,
      site_name: record.site_name || target.name,
      site_color: record.site_color || target.color || DEFAULT_SITE.color,
    };
  });

  target.name = name;
  target.unit_price = unitPrice;
  target.color = color;
  saveState(state);
}

export async function deleteSite(id) {
  const state = getStateSnapshot();
  const target = state.sites.find((site) => site.id === id);

  if (target) {
    state.records = state.records.map((record) => {
      if (record.site_id !== id) {
        return record;
      }

      return {
        ...record,
        site_name: record.site_name || target.name,
        site_color: record.site_color || target.color || DEFAULT_SITE.color,
      };
    });
  }

  state.sites = state.sites.filter((site) => site.id !== id);
  saveState(state);
}

export async function deleteAllSites() {
  const state = getStateSnapshot();
  const existingSites = [...state.sites];

  state.records = state.records.map((record) => {
    const matchedSite = existingSites.find((site) => site.id === record.site_id);
    if (!matchedSite) {
      return record;
    }

    return {
      ...record,
      site_name: record.site_name || matchedSite.name,
      site_color: record.site_color || matchedSite.color || DEFAULT_SITE.color,
    };
  });

  state.sites = [];
  saveState(state);
}

export async function getRecordsByMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const state = loadState();
  return sortRecords(
    state.records
      .filter((record) => String(record.date).startsWith(prefix))
      .map((record) => resolveRecord(record, state.sites))
  );
}

export async function getRecordsByDateRange(startDate, endDate) {
  const state = loadState();
  return sortRecords(
    state.records
      .filter((record) => record.date >= startDate && record.date <= endDate)
      .map((record) => resolveRecord(record, state.sites))
  );
}

export async function getRecordsByDate(date) {
  const state = loadState();
  return sortRecords(
    state.records
      .filter((record) => record.date === date)
      .map((record) => resolveRecord(record, state.sites))
  );
}

export async function deleteRecordsByDate(date) {
  const state = getStateSnapshot();
  state.records = state.records.filter((record) => record.date !== date);
  saveState(state);
}

export async function saveRecords(date, items, memo, isSettled, isHoliday) {
  const state = getStateSnapshot();
  const trimmedMemo = String(memo ?? '').trim();

  state.records = state.records.filter((record) => record.date !== date);

  const normalizedItems = (items ?? [])
    .map(normalizeItem)
    .filter(
      (item) =>
        item.gongsu > 0 ||
        item.taskName.length > 0 ||
        item.siteId !== null ||
        item.siteName.length > 0
    );

  if (normalizedItems.length === 0 && trimmedMemo.length === 0 && !isSettled && !isHoliday) {
    saveState(state);
    return;
  }

  const rows =
    normalizedItems.length > 0
      ? normalizedItems
      : [
          {
            siteId: null,
            siteName: '',
            siteColor: DEFAULT_SITE.color,
            taskName: '',
            gongsu: 0,
            unitPrice: 0,
          },
        ];

  rows.forEach((item) => {
    const amount = Math.round(item.gongsu * item.unitPrice);
    state.records.push({
      id: state.counters.record,
      date,
      site_id: item.siteId,
      site_name: item.siteName,
      site_color: item.siteColor,
      task_name: item.taskName,
      gongsu: item.gongsu,
      unit_price: item.unitPrice,
      amount,
      memo: trimmedMemo,
      is_settled: isSettled ? 1 : 0,
      is_holiday: isHoliday ? 1 : 0,
      created_at: getNowIso(),
    });
    state.counters.record += 1;
  });

  saveState(state);
}

export async function setSettled(date, isSettled) {
  const state = getStateSnapshot();
  state.records = state.records.map((record) =>
    record.date === date ? { ...record, is_settled: isSettled ? 1 : 0 } : record
  );
  saveState(state);
}

export async function setSettledByMonth(year, month, isSettled) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const state = getStateSnapshot();
  state.records = state.records.map((record) =>
    String(record.date).startsWith(prefix)
      ? { ...record, is_settled: isSettled ? 1 : 0 }
      : record
  );
  saveState(state);
}

export async function setSettledByDateRange(startDate, endDate, isSettled) {
  const state = getStateSnapshot();
  state.records = state.records.map((record) =>
    record.date >= startDate && record.date <= endDate
      ? { ...record, is_settled: isSettled ? 1 : 0 }
      : record
  );
  saveState(state);
}

export async function exportBackupData() {
  const state = loadState();
  return {
    app: 'gongsu-app',
    schemaVersion: 1,
    exportedAt: getNowIso(),
    sites: sortByCreatedAtThenId(state.sites),
    records: sortRecords(state.records),
  };
}

export async function previewBackupData(payload, source = {}) {
  const { normalizedSites, normalizedRecords } = await prepareImportedData(payload, source);
  return {
    siteCount: normalizedSites.length,
    recordCount: normalizedRecords.length,
  };
}

export async function importBackupData(payload, source = {}) {
  const importMode = source.mode === 'merge' ? 'merge' : 'replace';
  let { normalizedSites, normalizedRecords, allowSyntheticSites } = await prepareImportedData(
    payload,
    source
  );
  const state = getStateSnapshot();

  if (importMode === 'replace') {
    state.records = [];
    state.sites = [];
  } else {
    const existingSites = state.sites.map((site) => ({
      id: site.id,
      name: site.name,
      unitPrice: site.unit_price,
      color: site.color,
      createdAt: site.created_at,
    }));
    const existingRecords = state.records.map((record) => ({
      date: record.date,
      siteId: record.site_id,
      siteName: record.site_name,
      siteColor: record.site_color,
      taskName: record.task_name,
      gongsu: record.gongsu,
      unitPrice: record.unit_price,
      amount: record.amount,
      memo: record.memo,
      isSettled: record.is_settled,
      isHoliday: record.is_holiday,
      createdAt: record.created_at,
    }));

    const mergedPayload = mergeImportedPayload(
      existingSites,
      existingRecords,
      normalizedSites,
      normalizedRecords,
      {
        allowSyntheticSites,
      }
    );

    normalizedSites = mergedPayload.sites;
    normalizedRecords = mergedPayload.records;
  }

  for (const site of normalizedSites) {
    const row = toSiteRow(site, state.counters.site);
    state.sites.push(row);
    state.counters.site = Math.max(state.counters.site, Number(row.id) + 1);
  }

  for (const record of normalizedRecords) {
    const row = toRecordRow(record, state.counters.record);
    state.records.push(row);
    state.counters.record = Math.max(state.counters.record, Number(row.id) + 1);
  }

  saveState(state);

  return {
    siteCount: normalizedSites.length,
    recordCount: normalizedRecords.length,
  };
}

export function groupByDate(records) {
  return records.reduce((accumulator, record) => {
    if (!accumulator[record.date]) {
      accumulator[record.date] = {
        date: record.date,
        totalGongsu: 0,
        totalAmount: 0,
        isSettled: record.is_settled === 1,
        isHoliday: record.is_holiday === 1,
        memo: record.memo ?? '',
        items: [],
      };
    }

    accumulator[record.date].totalGongsu += Number(record.gongsu ?? 0);
    accumulator[record.date].totalAmount += Number(record.amount ?? 0);
    accumulator[record.date].items.push(record);

    return accumulator;
  }, {});
}
