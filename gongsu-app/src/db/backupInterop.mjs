import JSON5 from 'json5';
import * as XLSX from 'xlsx';

const DEFAULT_SITE_IMPORT = {
  name: '기본 현장',
  unitPrice: 200000,
  color: '#185FA5',
};

const CONTAINER_KEYS = [
  'data',
  'backup',
  'payload',
  'result',
  'export',
  'exportData',
  'backupData',
  'appData',
  'archive',
  'state',
  'snapshot',
];

const SITE_KEYS = [
  'sites',
  'siteList',
  'worksites',
  'jobSites',
  'siteMap',
  'sitesById',
];

const RECORD_KEYS = [
  'records',
  'recordList',
  'entries',
  'items',
  'works',
  'dailyRecords',
  'workLogs',
  'logs',
  'recordsByDate',
  'entriesByDate',
  'worksByDate',
  'daily',
  'days',
  'calendar',
];

const DATE_KEYS = [
  'date',
  'day',
  'workDate',
  'recordDate',
  'targetDate',
  'workedAt',
  'timestamp',
  'time',
  'created',
  'createdDate',
  'created_date',
  'eventDate',
  'event_date',
  'occurredAt',
  'occurred_at',
  'loggedAt',
  'logged_at',
  'startTS',
  'start_ts',
];
const SITE_ID_KEYS = [
  'siteId',
  'site_id',
  'siteKey',
  'typeId',
  'type_id',
  'categoryId',
  'category_id',
  'eventTypeId',
  'event_type_id',
  'eventType',
  'event_type',
  'eventTypoe',
  'event_typoe',
];
const SITE_NAME_KEYS = ['siteName', 'site_name', 'site', 'siteTitle', 'siteLabel', 'worksite', 'jobSite', 'location', 'locationName', 'place', 'placeName'];
const SITE_COLOR_KEYS = ['siteColor', 'site_color', 'color', 'siteTint'];
const TASK_NAME_KEYS = [
  'taskName',
  'task_name',
  'task',
  'title',
  'work',
  'content',
  'description',
  'workName',
  'eventType',
  'event_type',
  'eventTypoe',
  'event_typoe',
  'typeName',
  'type_name',
  'category',
  'categoryName',
  'category_name',
  'label',
  'kind',
];
const GONGSU_KEYS = ['gongsu', 'gongsoo', 'gongSu', 'workload', 'qty', 'quantity', 'manDay', 'manDays', 'gong'];
const UNIT_PRICE_KEYS = ['unitPrice', 'unit_price', 'price', 'dailyRate', 'dayRate', 'unitCost', 'amountPerUnit'];
const AMOUNT_KEYS = ['amount', 'income', 'totalAmount', 'pay', 'earned', 'sum', 'value', 'money'];
const MEMO_KEYS = ['memo', 'note', 'notes', 'comment', 'detail', 'details', 'remark', 'remarks', 'desc', 'detail_memo'];
const SETTLED_KEYS = ['isSettled', 'is_settled', 'settled', 'done', 'completed', 'paid'];
const HOLIDAY_KEYS = ['isHoliday', 'is_holiday', 'holiday', 'dayOff', 'off'];
const CREATED_AT_KEYS = ['createdAt', 'created_at', 'savedAt', 'updatedAt', 'lastUpdated', 'last_updated', 'updated', 'updated_at'];
const RECORD_ID_KEYS = ['id', 'recordId', 'record_id'];
const DELIMITED_FORMAT_CANDIDATES = ['\t', ',', ';', '|'];
const HEADER_ALIASES = {
  date: [...DATE_KEYS, 'work_day', 'workday', '날짜', '일자', '작업일', '근무일'],
  siteId: [...SITE_ID_KEYS, 'siteid', '현장id'],
  siteName: [...SITE_NAME_KEYS, '현장', '현장명', '현장이름', '현장명칭'],
  siteColor: [...SITE_COLOR_KEYS, '색상', '컬러'],
  taskName: [...TASK_NAME_KEYS, '작업', '작업명', '업무', '공종', '내용'],
  gongsu: [...GONGSU_KEYS, '공수', '품', '인원', '맨데이'],
  unitPrice: [...UNIT_PRICE_KEYS, '단가', '일당'],
  amount: [...AMOUNT_KEYS, '금액', '합계', '총액', '수입'],
  memo: [...MEMO_KEYS, '메모', '비고', '노트'],
  isSettled: [...SETTLED_KEYS, '정산', '정산여부', '지급', '입금', '완료', '결제'],
  isHoliday: [...HOLIDAY_KEYS, '휴무', '휴무여부', '쉬는날', '휴일'],
  createdAt: [...CREATED_AT_KEYS, '생성일', '저장일', '수정일'],
};
const HEADER_ALIAS_MAP = new Map(
  Object.entries(HEADER_ALIASES).flatMap(([canonicalKey, aliases]) =>
    aliases.map((alias) => [normalizeHeaderLabel(alias), canonicalKey])
  )
);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickFirst(source, keys) {
  if (!isPlainObject(source)) {
    return undefined;
  }

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function inferDateValue(source) {
  if (!isPlainObject(source)) {
    return '';
  }

  const preferredCandidates = [];
  const fallbackCandidates = [];

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const normalizedKey = normalizeHeaderLabel(key);
    if (
      /(date|day|time|timestamp|created|updated|logged|worked|start|end|occurred|saved)/.test(
        normalizedKey
      )
    ) {
      preferredCandidates.push(value);
      continue;
    }

    fallbackCandidates.push(value);
  }

  for (const value of [...preferredCandidates, ...fallbackCandidates]) {
    const normalizedDate = normalizeDateValue(value);
    if (normalizedDate) {
      return normalizedDate;
    }
  }

  return '';
}

function isNumericLikeText(value) {
  const text = String(value ?? '').trim();
  return /^-?\d+(?:[.,]\d+)?$/.test(text);
}

function pickFirstText(source, keys, options = {}) {
  const { allowNumeric = true } = options;

  if (!isPlainObject(source)) {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();
    if (!text) {
      continue;
    }

    if (!allowNumeric && isNumericLikeText(text)) {
      continue;
    }

    return text;
  }

  return '';
}

function normalizeHeaderLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/["'`]/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/[\s_.:/\\-]+/g, '');
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    const stripped = trimmed.replace(/\s/g, '').replace(/[^\d,.\-]/g, '');
    if (!stripped) {
      return fallback;
    }

    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(stripped)) {
      const parsed = Number(stripped.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    if (/^-?\d+,\d+$/.test(stripped) && !stripped.includes('.')) {
      const parsed = Number(stripped.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    const parsed = Number(stripped.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBooleanFlag(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (
      [
        '1',
        'true',
        'yes',
        'y',
        'done',
        'settled',
        'holiday',
        'completed',
        'paid',
        '정산',
        '완료',
        '지급',
        '입금',
        '휴무',
        '휴일',
      ].includes(normalized)
    ) {
      return 1;
    }

    if (
      ['0', 'false', 'no', 'n', 'pending', 'unsettled', 'open', '미정산', '대기', '미지급', '근무'].includes(
        normalized
      )
    ) {
      return 0;
    }
  }

  return Number(value) === 1 ? 1 : 0;
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function convertExcelSerialToDate(value) {
  const serial = Math.floor(Number(value));
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) {
    return '';
  }

  const date = new Date(Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000);
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function convertCompactDateNumberToDate(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) {
    return '';
  }

  const text = String(Math.abs(numeric));
  if (!/^\d{8}$/.test(text)) {
    return '';
  }

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));

  if (year < 2000 || year > 2100) {
    return '';
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return formatDateParts(year, month, day);
}

function convertUnixTimestampToDate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  const absValue = Math.abs(numeric);
  let timestampMs = null;

  if (absValue >= 1e12 && absValue <= 9e15) {
    timestampMs = numeric;
  } else if (absValue >= 1e9 && absValue <= 9e10) {
    timestampMs = numeric * 1000;
  }

  if (timestampMs === null) {
    return '';
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function normalizeDateValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'number') {
    return (
      convertUnixTimestampToDate(value) ||
      convertCompactDateNumberToDate(value) ||
      convertExcelSerialToDate(value)
    );
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  let match = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\D.*)?$/);
  if (match) {
    const [, year, month, day] = match;
    return formatDateParts(year, month, day);
  }

  match = text.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?(?:\D.*)?$/);
  if (match) {
    const [, year, month, day] = match;
    return formatDateParts(year, month, day);
  }

  match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return formatDateParts(year, month, day);
  }

  if (/^-?\d+(?:[.,]\d+)?$/.test(text)) {
    const numericValue = toNumber(text, NaN);
    const unixDate = convertUnixTimestampToDate(numericValue);
    if (unixDate) {
      return unixDate;
    }

    const compactDate = convertCompactDateNumberToDate(numericValue);
    if (compactDate) {
      return compactDate;
    }

    const excelDate = convertExcelSerialToDate(numericValue);
    if (excelDate) {
      return excelDate;
    }
  }

  return '';
}

function sanitizeRawText(rawText) {
  return String(rawText ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .trim();
}

function extractCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : '';
}

function extractBalancedJsonSlice(text, startIndex) {
  const opening = text[startIndex];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opening) {
      depth += 1;
      continue;
    }

    if (char === closing) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return '';
}

function getJsonCandidates(rawText) {
  const text = sanitizeRawText(rawText);
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (candidate) => {
    const normalized = candidate.trim().replace(/;$/, '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(text);

  const fenced = extractCodeFence(text);
  if (fenced) {
    pushCandidate(fenced);
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '{' && char !== '[') {
      continue;
    }

    const slice = extractBalancedJsonSlice(text, index);
    if (slice) {
      pushCandidate(slice);
    }
  }

  return candidates;
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';

      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);
  return rows;
}

function hasRowContent(row) {
  return row.some((value) => String(value ?? '').trim().length > 0);
}

function getCanonicalHeaderKey(value) {
  return HEADER_ALIAS_MAP.get(normalizeHeaderLabel(value)) ?? null;
}

function analyzeHeaderRow(row) {
  const canonicalKeys = row.map(getCanonicalHeaderKey);
  const uniqueRecognizedCount = new Set(canonicalKeys.filter(Boolean)).size;
  const recognizedCount = canonicalKeys.filter(Boolean).length;

  return {
    canonicalKeys,
    uniqueRecognizedCount,
    recognizedCount,
  };
}

function findSpreadsheetHeaderRow(rows) {
  let bestCandidate = null;

  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const analysis = analyzeHeaderRow(rows[index]);
    if (analysis.uniqueRecognizedCount < 2) {
      continue;
    }

    if (
      !bestCandidate ||
      analysis.uniqueRecognizedCount > bestCandidate.uniqueRecognizedCount ||
      (analysis.uniqueRecognizedCount === bestCandidate.uniqueRecognizedCount &&
        analysis.recognizedCount > bestCandidate.recognizedCount)
    ) {
      bestCandidate = {
        index,
        ...analysis,
      };
    }
  }

  return bestCandidate;
}

function parseSpreadsheetRows(rows) {
  const normalizedRows = rows
    .map((row) => row.map((value) => String(value ?? '').trim()))
    .filter(hasRowContent);

  if (normalizedRows.length < 2) {
    return null;
  }

  const header = findSpreadsheetHeaderRow(normalizedRows);
  if (!header) {
    return null;
  }

  const records = [];

  for (let rowIndex = header.index + 1; rowIndex < normalizedRows.length; rowIndex += 1) {
    const row = normalizedRows[rowIndex];
    if (!hasRowContent(row)) {
      continue;
    }

    const record = {};

    header.canonicalKeys.forEach((canonicalKey, columnIndex) => {
      if (!canonicalKey || record[canonicalKey] !== undefined) {
        return;
      }

      const cellValue = row[columnIndex];
      if (cellValue === undefined || cellValue === '') {
        return;
      }

      record[canonicalKey] = cellValue;
    });

    if (Object.keys(record).length > 0) {
      records.push(record);
    }
  }

  return records.length > 0 ? { records } : null;
}

function tryParseSpreadsheetText(rawText, delimiter) {
  return parseSpreadsheetRows(parseDelimitedRows(rawText, delimiter));
}

export function parseSpreadsheetText(rawText) {
  const text = sanitizeRawText(rawText);
  if (!text) {
    throw new SyntaxError('Backup file is empty.');
  }

  for (const delimiter of DELIMITED_FORMAT_CANDIDATES) {
    const parsed = tryParseSpreadsheetText(text, delimiter);
    if (parsed) {
      return parsed;
    }
  }

  throw new SyntaxError(
    'Supported backup content was not found. Use JSON or a CSV/TSV sheet with headers like date, site, task, gongsu, and unitPrice.'
  );
}

export function parseSpreadsheetWorkbookBase64(base64Text) {
  const workbook = XLSX.read(String(base64Text ?? ''), {
    type: 'base64',
    cellDates: true,
  });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    const parsed = parseSpreadsheetRows(rows);
    if (parsed) {
      return parsed;
    }
  }

  throw new SyntaxError(
    'Supported backup columns were not found in the spreadsheet. Use headers like date, site, task, gongsu, and unitPrice.'
  );
}

export function parseBackupJsonText(rawText) {
  const candidates = getJsonCandidates(rawText);
  let lastError = null;

  if (candidates.length === 0) {
    throw new SyntaxError('백업 파일이 비어 있거나 JSON 본문을 찾을 수 없습니다.');
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }

    try {
      return JSON5.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new SyntaxError(
    lastError?.message || 'JSON 형식이 잘못되었거나 JSON 본문을 찾을 수 없습니다.'
  );
}

function getBinaryImportHint(options) {
  const sourceName = String(options.sourceName ?? '').trim().toLowerCase();

  if (/\.(sqlite|sqlite3|db)$/.test(sourceName)) {
    return 'SQLite 바이너리 파일은 텍스트 백업 파서로 읽을 수 없습니다. SQLite 가져오기 경로로 다시 선택해 주세요.';
  }

  return '';
}

function collectContainers(payload) {
  const containers = [];
  const queue = [payload];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!isPlainObject(current) || seen.has(current)) {
      continue;
    }

    seen.add(current);
    containers.push(current);

    for (const key of CONTAINER_KEYS) {
      if (current[key] !== undefined) {
        queue.push(current[key]);
      }
    }
  }

  return containers;
}

function normalizeSiteCollection(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value).map(([mapKey, item]) => {
    if (isPlainObject(item)) {
      return {
        ...item,
        id: pickFirst(item, ['id', 'siteId', 'site_id']) ?? mapKey,
      };
    }

    return {
      id: mapKey,
      name: String(item ?? '').trim(),
    };
  });
}

function hasOwnProperty(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function hasExplicitSiteCollection(payload) {
  if (Array.isArray(payload) || !isPlainObject(payload)) {
    return false;
  }

  for (const container of collectContainers(payload)) {
    for (const key of SITE_KEYS) {
      if (hasOwnProperty(container, key)) {
        return true;
      }
    }
  }

  return false;
}

export function isAuthoritativeSiteBackupPayload(payload) {
  if (Array.isArray(payload) || !isPlainObject(payload)) {
    return false;
  }

  for (const container of collectContainers(payload)) {
    const appId = String(container.app ?? container.appId ?? '').trim().toLowerCase();
    if (appId === 'gongsu-app') {
      return true;
    }
  }

  return false;
}

function extractRawSites(payload) {
  if (Array.isArray(payload)) {
    return [];
  }

  for (const container of collectContainers(payload)) {
    for (const key of SITE_KEYS) {
      if (!hasOwnProperty(container, key)) {
        continue;
      }

      const sites = normalizeSiteCollection(container[key]);
      if (sites.length > 0) {
        return sites;
      }
    }
  }

  return [];
}

function hasDirectRecordSignal(value) {
  return Boolean(
    pickFirst(value, DATE_KEYS) ||
      pickFirst(value, TASK_NAME_KEYS) ||
      pickFirst(value, GONGSU_KEYS) !== undefined ||
      pickFirst(value, UNIT_PRICE_KEYS) !== undefined ||
      pickFirst(value, AMOUNT_KEYS) !== undefined ||
      pickFirst(value, SITE_NAME_KEYS) ||
      pickFirst(value, MEMO_KEYS) ||
      pickFirst(value, SETTLED_KEYS) !== undefined ||
      pickFirst(value, HOLIDAY_KEYS) !== undefined
  );
}

function isLikelyDateMap(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, entry]) => normalizeDateValue(key) && (Array.isArray(entry) || isPlainObject(entry)));
}

function mergeRecordContext(inherited, source) {
  const next = { ...inherited };
  const date = normalizeDateValue(pickFirst(source, DATE_KEYS));
  const siteId = pickFirst(source, SITE_ID_KEYS);
  const siteName = pickFirst(source, SITE_NAME_KEYS);
  const siteColor = pickFirst(source, SITE_COLOR_KEYS);
  const unitPrice = pickFirst(source, UNIT_PRICE_KEYS);
  const memo = pickFirst(source, MEMO_KEYS);
  const settled = pickFirst(source, SETTLED_KEYS);
  const holiday = pickFirst(source, HOLIDAY_KEYS);
  const createdAt = pickFirst(source, CREATED_AT_KEYS);

  if (date) {
    next.date = date;
  }

  if (siteId !== undefined) {
    next.siteId = siteId;
  }

  if (siteName !== undefined) {
    next.siteName = siteName;
  }

  if (siteColor !== undefined) {
    next.siteColor = siteColor;
  }

  if (unitPrice !== undefined) {
    next.unitPrice = unitPrice;
  }

  if (memo !== undefined) {
    next.memo = memo;
  }

  if (settled !== undefined) {
    next.isSettled = settled;
  }

  if (holiday !== undefined) {
    next.isHoliday = holiday;
  }

  if (createdAt !== undefined) {
    next.createdAt = createdAt;
  }

  return next;
}

function flattenRecordCandidates(value, inherited = {}) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenRecordCandidates(entry, inherited));
  }

  if (!isPlainObject(value)) {
    return [];
  }

  if (isLikelyDateMap(value)) {
    return Object.entries(value).flatMap(([dateKey, entry]) =>
      flattenRecordCandidates(entry, {
        ...inherited,
        date: normalizeDateValue(dateKey),
      })
    );
  }

  for (const key of RECORD_KEYS) {
    if (value[key] === undefined) {
      continue;
    }

    const flattened = flattenRecordCandidates(value[key], mergeRecordContext(inherited, value));
    if (flattened.length > 0) {
      return flattened;
    }
  }

  const merged = { ...inherited, ...value };
  const normalizedDate =
    normalizeDateValue(pickFirst(merged, DATE_KEYS) ?? merged.date) || inferDateValue(merged);

  if (!normalizedDate) {
    return [];
  }

  if (!hasDirectRecordSignal(merged) && !pickFirst(merged, MEMO_KEYS) && !pickFirst(merged, SETTLED_KEYS) && !pickFirst(merged, HOLIDAY_KEYS)) {
    return [];
  }

  return [
    {
      ...merged,
      date: normalizedDate,
    },
  ];
}

function extractRawRecords(payload) {
  if (Array.isArray(payload)) {
    return flattenRecordCandidates(payload);
  }

  const containers = collectContainers(payload);

  for (const container of containers) {
    for (const key of RECORD_KEYS) {
      if (container[key] === undefined) {
        continue;
      }

      const records = flattenRecordCandidates(container[key], mergeRecordContext({}, container));
      if (records.length > 0) {
        return records;
      }
    }
  }

  for (const container of containers) {
    const records = flattenRecordCandidates(container);
    if (records.length > 0) {
      return records;
    }
  }

  return [];
}

function normalizeSiteBackup(site, index, options) {
  const fallback = options.defaultSite ?? DEFAULT_SITE_IMPORT;
  const id = pickFirst(site, ['id', 'siteId', 'site_id']);
  const name = pickFirstText(
    site,
    [
      'name',
      'siteName',
      'site_name',
      'title',
      'label',
      'siteLabel',
      'typeName',
      'type_name',
      'categoryName',
      'category_name',
    ],
    { allowNumeric: false }
  );
  const unitPrice = toNumber(pickFirst(site, ['unitPrice', 'unit_price', 'price', 'dailyRate', 'dayRate']), 0);
  const color = String(pickFirst(site, ['color', 'siteColor', 'site_color']) ?? fallback.color);
  const createdAt = String(
    pickFirst(site, CREATED_AT_KEYS) ?? new Date(Date.now() + index).toISOString()
  );

  if (!name) {
    return null;
  }

  return {
    id: Number.isInteger(Number(id)) ? Number(id) : null,
    name,
    unitPrice,
    color,
    createdAt,
  };
}

function normalizeRecordBackup(record, index, options) {
  const fallback = options.defaultSite ?? DEFAULT_SITE_IMPORT;
  const date =
    normalizeDateValue(pickFirst(record, DATE_KEYS) ?? record.date ?? pickFirst(record, CREATED_AT_KEYS)) ||
    inferDateValue(record);
  if (!date) {
    return null;
  }

  const siteId = pickFirst(record, SITE_ID_KEYS);
  const siteName = pickFirstText(record, SITE_NAME_KEYS, { allowNumeric: false });
  const siteColor = String(pickFirst(record, SITE_COLOR_KEYS) ?? record.siteColor ?? fallback.color);
  const taskName = pickFirstText(record, TASK_NAME_KEYS, { allowNumeric: false });
  let gongsu = toNumber(pickFirst(record, GONGSU_KEYS), 0);
  const unitPrice = toNumber(pickFirst(record, UNIT_PRICE_KEYS), 0);
  const amountValue = pickFirst(record, AMOUNT_KEYS);
  let amount = Math.round(
    amountValue === undefined ? gongsu * unitPrice : toNumber(amountValue, gongsu * unitPrice)
  );
  const looseAmount = toNumber(amountValue, 0);

  if (
    gongsu <= 0 &&
    looseAmount > 0 &&
    looseAmount <= 24 &&
    (unitPrice > 0 || !Number.isInteger(looseAmount) || looseAmount <= 12)
  ) {
    gongsu = looseAmount;
    amount = unitPrice > 0 ? Math.round(looseAmount * unitPrice) : Math.round(looseAmount);
  }

  const memo = pickFirstText(record, MEMO_KEYS);
  const isSettled = toBooleanFlag(pickFirst(record, SETTLED_KEYS) ?? record.isSettled);
  const isHoliday = toBooleanFlag(pickFirst(record, HOLIDAY_KEYS) ?? record.isHoliday);
  const createdAt = String(
    pickFirst(record, CREATED_AT_KEYS) ?? new Date(Date.now() + index).toISOString()
  );
  const id = pickFirst(record, RECORD_ID_KEYS);

  const hasContent =
    taskName.length > 0 ||
    siteName.length > 0 ||
    gongsu > 0 ||
    unitPrice > 0 ||
    amount > 0 ||
    memo.length > 0 ||
    isSettled === 1 ||
    isHoliday === 1;

  if (!hasContent) {
    return null;
  }

  return {
    id: Number.isInteger(Number(id)) ? Number(id) : null,
    date,
    siteId: Number.isInteger(Number(siteId)) ? Number(siteId) : null,
    siteName,
    siteColor,
    taskName,
    gongsu,
    unitPrice,
    amount,
    memo,
    isSettled,
    isHoliday,
    createdAt,
  };
}

function ensureSiteCoverage(sites, records, options) {
  const fallback = options.defaultSite ?? DEFAULT_SITE_IMPORT;
  const allowSyntheticSites = options.allowSyntheticSites !== false;
  const nextSites = [...sites];
  const siteById = new Map();
  const siteByName = new Map();
  const usedIds = new Set();
  let nextGeneratedId = 1;

  for (const site of nextSites) {
    if (Number.isInteger(site.id)) {
      siteById.set(site.id, site);
      usedIds.add(site.id);
      nextGeneratedId = Math.max(nextGeneratedId, site.id + 1);
    }

    if (site.name && !siteByName.has(site.name)) {
      siteByName.set(site.name, site);
    }
  }

  const makeSiteId = (preferredId = null) => {
    if (Number.isInteger(preferredId) && !usedIds.has(preferredId)) {
      usedIds.add(preferredId);
      nextGeneratedId = Math.max(nextGeneratedId, preferredId + 1);
      return preferredId;
    }

    while (usedIds.has(nextGeneratedId)) {
      nextGeneratedId += 1;
    }

    usedIds.add(nextGeneratedId);
    const createdId = nextGeneratedId;
    nextGeneratedId += 1;
    return createdId;
  };

  const ensureSite = (record) => {
    if (!record.siteName) {
      return null;
    }

    if (Number.isInteger(record.siteId) && siteById.has(record.siteId)) {
      return siteById.get(record.siteId);
    }

    if (siteByName.has(record.siteName)) {
      return siteByName.get(record.siteName);
    }

    if (!allowSyntheticSites) {
      return null;
    }

    const site = {
      id: makeSiteId(record.siteId),
      name: record.siteName,
      unitPrice: record.unitPrice > 0 ? record.unitPrice : fallback.unitPrice,
      color: record.siteColor || fallback.color,
      createdAt: record.createdAt || new Date().toISOString(),
    };

    nextSites.push(site);
    siteById.set(site.id, site);
    siteByName.set(site.name, site);
    return site;
  };

  const nextRecords = records.map((record) => {
    if (Number.isInteger(record.siteId) && siteById.has(record.siteId)) {
      return record;
    }

    const site = ensureSite(record);

    if (!site) {
      return record;
    }

    return {
      ...record,
      siteId: site.id,
      siteName: record.siteName || site.name,
      siteColor: record.siteColor || site.color,
      unitPrice: record.unitPrice > 0 ? record.unitPrice : site.unitPrice,
    };
  });

  return {
    sites: nextSites,
    records: nextRecords,
  };
}

export function normalizeBackupImport(payload, options = {}) {
  const authoritativeSiteBackup = isAuthoritativeSiteBackupPayload(payload);
  const explicitSiteCollection = hasExplicitSiteCollection(payload);
  const rawSites = extractRawSites(payload);
  const rawRecords = extractRawRecords(payload);
  const normalizedSites = rawSites
    .map((site, index) => normalizeSiteBackup(site, index, options))
    .filter(Boolean);
  const normalizedRecords = rawRecords
    .map((record, index) => normalizeRecordBackup(record, index, options))
    .filter(Boolean);
  const allowSyntheticSites =
    options.allowSyntheticSites ?? !authoritativeSiteBackup;
  const normalized = ensureSiteCoverage(normalizedSites, normalizedRecords, {
    ...options,
    allowSyntheticSites,
  });

  return {
    ...normalized,
    hasExplicitSiteCollection: explicitSiteCollection,
    isAuthoritativeSiteBackup: authoritativeSiteBackup,
    allowSyntheticSites,
  };
}

export function parseAndNormalizeBackupImport(input, options = {}) {
  let payload = input;

  if (isPlainObject(input) && typeof input.workbookBase64 === 'string') {
    payload = parseSpreadsheetWorkbookBase64(input.workbookBase64);
  } else if (typeof input === 'string') {
    const binaryImportHint = getBinaryImportHint(options);
    if (binaryImportHint) {
      throw new SyntaxError(binaryImportHint);
    }

    try {
      payload = parseBackupJsonText(input);
    } catch (jsonError) {
      try {
        payload = parseSpreadsheetText(input);
      } catch (spreadsheetError) {
        throw new SyntaxError(spreadsheetError.message || jsonError.message || 'Unsupported backup format.');
      }
    }
  }

  return normalizeBackupImport(payload, options);
}
