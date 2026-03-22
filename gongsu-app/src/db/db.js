import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { normalizeBackupImport, parseAndNormalizeBackupImport } from './backupInterop.mjs';

const DEFAULT_SITE = {
  name: '기본 현장',
  unitPrice: 200000,
  color: '#185FA5',
};

let databasePromise;
const SQLITE_IMPORT_FOLDER_NAME = 'sqlite-imports';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSQLiteImportPayload(payload) {
  return isPlainObject(payload) && typeof payload.sqliteSourceUri === 'string';
}

function getImportWorkingDirectory() {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error('No writable directory is available for importing backups.');
  }

  return `${baseDirectory}${SQLITE_IMPORT_FOLDER_NAME}/`;
}

function getSafeImportFileName(sourceName = 'backup.sqlite') {
  const normalized = String(sourceName ?? '').trim();
  const extension = normalized.match(/\.(sqlite3?|db)$/i)?.[0] ?? '.sqlite';
  return `restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
}

function escapeSqliteIdentifier(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function ensureWorkingDirectoryExists(directoryUri) {
  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, {
      intermediates: true,
    });
  }
}

async function cleanupImportedSqliteFiles(targetUri) {
  for (const candidateUri of [targetUri, `${targetUri}-wal`, `${targetUri}-shm`]) {
    try {
      await FileSystem.deleteAsync(candidateUri, {
        idempotent: true,
      });
    } catch {}
  }
}

function normalizeSqliteKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.:/\\-]+/g, '');
}

function getSqliteKeySet(rows, columnNames = []) {
  const keys = new Set(columnNames.map(normalizeSqliteKey));

  for (const row of rows) {
    if (!isPlainObject(row)) {
      continue;
    }

    for (const key of Object.keys(row)) {
      keys.add(normalizeSqliteKey(key));
    }
  }

  return keys;
}

function classifySqliteRows(rows, tableName = '', columnNames = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'unknown';
  }

  const normalizedTableName = normalizeSqliteKey(tableName);
  const keySet = getSqliteKeySet(rows, columnNames);
  const hasRecordLikeColumn = Array.from(keySet).some((key) =>
    /(date|day|time|timestamp|amount|price|memo|note|comment|task|work|content|type|event|qty|quantity|gongsu|paid)/.test(
      key
    )
  );
  const hasSiteLikeColumn = Array.from(keySet).some((key) =>
    /(name|title|label|color|site|place|location|type|category)/.test(key)
  );

  const recordProbe = normalizeBackupImport(
    {
      records: rows,
    },
    {
      defaultSite: DEFAULT_SITE,
    }
  );

  if (recordProbe.records.length > 0) {
    return 'records';
  }

  if (
    /(amount|record|entry|log|work|daily|history|data)/.test(normalizedTableName) &&
    hasRecordLikeColumn
  ) {
    return 'records';
  }

  const siteProbe = normalizeBackupImport(
    {
      sites: rows,
    },
    {
      defaultSite: DEFAULT_SITE,
    }
  );

  if (siteProbe.sites.length > 0) {
    return 'sites';
  }

  if (
    /(site|type|category|label|event|place|location)/.test(normalizedTableName) &&
    hasSiteLikeColumn &&
    !hasRecordLikeColumn
  ) {
    return 'sites';
  }

  return 'unknown';
}

function hasSqliteColumns(columnNames, expectedKeys) {
  const normalizedColumns = new Set(columnNames.map(normalizeSqliteKey));
  return expectedKeys.every((key) => normalizedColumns.has(normalizeSqliteKey(key)));
}

function findSqliteTableMeta(tableMetas, pattern) {
  return tableMetas.find((meta) => pattern.test(normalizeSqliteKey(meta.tableName)));
}

function isNumericMemoText(value) {
  return /^-?\d+(?:[.,]\d+)?$/.test(String(value ?? '').trim());
}

function looksLikeRoomTaskText(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return false;
  }

  if (/[\n,()]/.test(text)) {
    return true;
  }

  return /(주간|야간|주야간|철야|오전|오후|연장근무|특근|근무|휴무|출근|입선|항공|재작업|몰딩|샤프트|해포|이적|비상벨|몰드바|as|obc)/i.test(
    text
  );
}

function looksLikeRoomSiteText(value, occurrenceCount = 0) {
  const text = String(value ?? '').trim();
  if (!text || isNumericMemoText(text)) {
    return false;
  }

  if (looksLikeRoomTaskText(text)) {
    return false;
  }

  if (/[\n,]/.test(text)) {
    return false;
  }

  if (occurrenceCount > 1) {
    return true;
  }

  return /(대우|푸르지오|레미안|한화|효성|한진|대림|라인|블랑|행복주택|에코델타|시티|lh|lg|타이어|문현|창원|대구|제주|울산|김해|온천|사송|구미|명지|시청|케니스트|린)/i.test(
    text
  );
}

function formatSqliteTableSummary(tableMetas) {
  return tableMetas
    .map((meta) => {
      const columns = Array.isArray(meta.columnNames) && meta.columnNames.length > 0
        ? `(${meta.columnNames.join(', ')})`
        : '';
      const rowCountLabel = Number.isFinite(meta.rowCount) ? `[rows=${meta.rowCount}]` : '';
      return `${meta.tableName}${rowCountLabel}${columns}`;
    })
    .join(', ');
}

function buildSqliteImportError(tableMetas) {
  const tableSummary = formatSqliteTableSummary(tableMetas);
  const hasRows = tableMetas.some((meta) => Number(meta.rowCount) > 0);
  const hasRoomAmountSchema =
    findSqliteTableMeta(tableMetas, /^amount$/) &&
    findSqliteTableMeta(tableMetas, /^eventtypes$|^eventtype$|^eventtypoe$|^eventtypoes$/);

  if (!hasRows) {
    const walHint = hasRoomAmountSchema
      ? ' The schema was found, but this file has no rows. On Android, another app may have stored live data in a separate -wal file.'
      : ' The file contains table definitions, but no rows were available to import.';
    return `SQLite backup opened, but no importable rows were found.${walHint}${tableSummary ? ` Found tables: ${tableSummary}` : ''}`;
  }

  return `SQLite backup opened and rows were found, but the schema did not match an importable format yet.${tableSummary ? ` Found tables: ${tableSummary}` : ''}`;
}

async function tryImportRoomAmountSqlite(importedDatabase, tableMetas) {
  const amountTable = findSqliteTableMeta(tableMetas, /^amount$/);
  if (!amountTable || !hasSqliteColumns(amountTable.columnNames, ['startTS', 'amount', 'price'])) {
    return null;
  }

  const eventTypesTable =
    findSqliteTableMeta(tableMetas, /^eventtypes$/) ||
    findSqliteTableMeta(tableMetas, /^eventtype$/) ||
    findSqliteTableMeta(tableMetas, /^eventtypoe$/) ||
    findSqliteTableMeta(tableMetas, /^eventtypoes$/);

  const amountRows = await importedDatabase.getAllAsync(
    `SELECT * FROM ${escapeSqliteIdentifier(amountTable.tableName)}`
  );

  const detailMemoCounts = new Map();
  for (const row of amountRows) {
    const detailMemo = String(pickFirst(row, ['detail_memo', 'memo', 'note']) ?? '').trim();
    if (!detailMemo || isNumericMemoText(detailMemo)) {
      continue;
    }

    detailMemoCounts.set(detailMemo, (detailMemoCounts.get(detailMemo) ?? 0) + 1);
  }

  const eventTypeRows = eventTypesTable
    ? await importedDatabase.getAllAsync(
        `SELECT * FROM ${escapeSqliteIdentifier(eventTypesTable.tableName)}`
      )
    : [];

  const eventTypeMap = new Map(
    eventTypeRows.map((row) => [
      String(pickFirst(row, ['id', 'event_type', 'eventType']) ?? ''),
      row,
    ])
  );

  const adaptedRecords = amountRows.map((row) => {
    const eventTypeId = pickFirst(row, ['event_type', 'eventType', 'event_typoe', 'eventTypoe']);
    const eventMeta = eventTypeMap.get(String(eventTypeId ?? '')) ?? null;
    const detailMemo = String(pickFirst(row, ['detail_memo', 'memo', 'note']) ?? '').trim();
    const eventTitle = String(pickFirst(eventMeta, ['title', 'name', 'label']) ?? '').trim();
    const memoLooksNumeric = isNumericMemoText(detailMemo);
    const detailLooksSite = looksLikeRoomSiteText(detailMemo, detailMemoCounts.get(detailMemo) ?? 0);
    const detailLooksTask = !detailLooksSite && looksLikeRoomTaskText(detailMemo);
    const siteName = eventTitle || (detailLooksSite ? detailMemo : '');
    const siteColor = String(pickFirst(eventMeta, ['color']) ?? DEFAULT_SITE.color);
    const taskName = detailMemo && !memoLooksNumeric && detailLooksTask ? detailMemo : '';
    const memo =
      memoLooksNumeric || (detailMemo && !detailLooksSite && !detailLooksTask) ? detailMemo : '';

    return {
      date: pickFirst(row, ['startTS', 'start_ts', 'timestamp', 'last_updated']),
      siteId:
        siteName === eventTitle && Number.isInteger(Number(eventTypeId)) && Number(eventTypeId) > 0
          ? Number(eventTypeId)
          : null,
      siteName,
      siteColor,
      taskName,
      gongsu: toNumber(pickFirst(row, ['amount']), 0),
      unitPrice: toNumber(pickFirst(row, ['price', 'unit_price', 'unitPrice']), 0),
      memo,
      createdAt: pickFirst(row, ['last_updated', 'startTS', 'start_ts']),
    };
  });

  const normalized = normalizeBackupImport(
    {
      records: adaptedRecords,
    },
    {
      defaultSite: DEFAULT_SITE,
    }
  );

  return normalized.records.length > 0 ? normalized : null;
}

async function importSqliteBackupPayload(payload, source = {}) {
  const workingDirectory = getImportWorkingDirectory();
  await ensureWorkingDirectoryExists(workingDirectory);

  const importFileName = getSafeImportFileName(source.name);
  const targetUri = `${workingDirectory}${importFileName}`;

  await cleanupImportedSqliteFiles(targetUri);
  await FileSystem.copyAsync({
    from: payload.sqliteSourceUri,
    to: targetUri,
  });

  const importedDatabase = await SQLite.openDatabaseAsync(
    importFileName,
    {
      useNewConnection: true,
    },
    workingDirectory
  );

  try {
    const tables = await importedDatabase.getAllAsync(
      `
        SELECT name
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `
    );

    const tableMetas = [];
    for (const table of tables) {
      const tableName = String(table?.name ?? '').trim();
      if (!tableName) {
        continue;
      }

      const columns = await importedDatabase.getAllAsync(
        `PRAGMA table_info(${escapeSqliteIdentifier(tableName)})`
      );
      const columnNames = columns.map((column) => String(column?.name ?? '').trim()).filter(Boolean);
      const rowCountResult = await importedDatabase.getFirstAsync(
        `SELECT COUNT(*) AS rowCount FROM ${escapeSqliteIdentifier(tableName)}`
      );
      const rowCount = Number(rowCountResult?.rowCount ?? rowCountResult?.count ?? 0);

      const sampleRows = await importedDatabase.getAllAsync(
        `SELECT * FROM ${escapeSqliteIdentifier(tableName)} LIMIT 25`
      );

      tableMetas.push({
        tableName,
        columnNames,
        rowCount,
        sampleRows,
      });
    }

    const roomAmountImport = await tryImportRoomAmountSqlite(importedDatabase, tableMetas);
    if (roomAmountImport) {
      return roomAmountImport;
    }

    const rawSites = [];
    const rawRecords = [];

    for (const meta of tableMetas) {
      const { tableName, columnNames, sampleRows } = meta;

      const tableKind = classifySqliteRows(sampleRows, tableName, columnNames);
      if (tableKind === 'unknown') {
        continue;
      }

      const allRows = await importedDatabase.getAllAsync(
        `SELECT * FROM ${escapeSqliteIdentifier(tableName)}`
      );

      if (tableKind === 'records') {
        rawRecords.push(...allRows);
      } else if (tableKind === 'sites') {
        rawSites.push(...allRows);
      }
    }

    const normalized = normalizeBackupImport(
      {
        sites: rawSites,
        records: rawRecords,
      },
      {
        defaultSite: DEFAULT_SITE,
      }
    );

    if (normalized.sites.length === 0 && normalized.records.length === 0) {
      throw new Error(buildSqliteImportError(tableMetas));
    }

    return normalized;
  } finally {
    try {
      await importedDatabase.closeAsync();
    } catch {}

    await cleanupImportedSqliteFiles(targetUri);
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBooleanFlag(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'done', 'settled', 'holiday'].includes(normalized)) {
      return 1;
    }
    if (['0', 'false', 'no', 'n', 'pending', 'unsettled'].includes(normalized)) {
      return 0;
    }
  }

  return Number(value) === 1 ? 1 : 0;
}

function pickFirst(source, keys) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeSiteBackup(site, index) {
  const id = pickFirst(site, ['id', 'siteId', 'site_id']);
  const name = String(pickFirst(site, ['name', 'siteName', 'site_name']) ?? '').trim();
  const unitPrice = toNumber(pickFirst(site, ['unitPrice', 'unit_price', 'price', 'dailyRate']), 0);
  const color = String(pickFirst(site, ['color', 'siteColor', 'site_color']) ?? DEFAULT_SITE.color);
  const createdAt = String(
    pickFirst(site, ['createdAt', 'created_at']) ?? new Date(Date.now() + index).toISOString()
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

function normalizeRecordBackup(record, index) {
  const date = String(pickFirst(record, ['date', 'day', 'workDate', 'recordDate']) ?? '').trim();
  if (!date) {
    return null;
  }

  const siteId = pickFirst(record, ['siteId', 'site_id']);
  const siteName = String(pickFirst(record, ['siteName', 'site_name', 'site']) ?? '').trim();
  const siteColor = String(
    pickFirst(record, ['siteColor', 'site_color', 'color']) ?? DEFAULT_SITE.color
  );
  const taskName = String(
    pickFirst(record, ['taskName', 'task_name', 'task', 'title', 'work', 'content']) ?? ''
  ).trim();
  const gongsu = toNumber(
    pickFirst(record, ['gongsu', 'gongsoo', 'gongSu', 'workload', 'qty']),
    0
  );
  const unitPrice = toNumber(
    pickFirst(record, ['unitPrice', 'unit_price', 'price', 'dailyRate']),
    0
  );
  const amountValue = pickFirst(record, ['amount', 'income', 'totalAmount']);
  const amount = Math.round(
    amountValue === undefined ? gongsu * unitPrice : toNumber(amountValue, gongsu * unitPrice)
  );
  const memo = String(pickFirst(record, ['memo', 'note', 'notes', 'comment']) ?? '').trim();
  const isSettled = toBooleanFlag(
    pickFirst(record, ['isSettled', 'is_settled', 'settled', 'done'])
  );
  const isHoliday = toBooleanFlag(
    pickFirst(record, ['isHoliday', 'is_holiday', 'holiday', 'dayOff'])
  );
  const createdAt = String(
    pickFirst(record, ['createdAt', 'created_at']) ?? new Date(Date.now() + index).toISOString()
  );

  return {
    id: Number.isInteger(Number(record.id)) ? Number(record.id) : null,
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

function extractBackupArrays(payload) {
  if (Array.isArray(payload)) {
    return {
      sites: [],
      records: payload,
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      sites: [],
      records: [],
    };
  }

  const containers = [payload, payload.data, payload.backup, payload.payload].filter(Boolean);

  for (const container of containers) {
    const sites = pickFirst(container, ['sites', 'siteList', 'worksites', 'jobSites']);
    const records = pickFirst(container, ['records', 'recordList', 'entries', 'items', 'works']);

    if (Array.isArray(sites) || Array.isArray(records)) {
      return {
        sites: Array.isArray(sites) ? sites : [],
        records: Array.isArray(records) ? records : [],
      };
    }
  }

  return {
    sites: [],
    records: [],
  };
}

async function ensureColumn(database, table, column, definition) {
  const columns = await database.getAllAsync(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition};`);
  }
}

async function initializeDatabase() {
  const database = await SQLite.openDatabaseAsync('gongsu.db');

  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      color TEXT DEFAULT '#185FA5',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      site_id INTEGER,
      site_name TEXT,
      site_color TEXT,
      task_name TEXT,
      gongsu REAL NOT NULL DEFAULT 0,
      unit_price INTEGER DEFAULT 0,
      amount INTEGER DEFAULT 0,
      memo TEXT DEFAULT '',
      is_settled INTEGER DEFAULT 0,
      is_holiday INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
  `);

  await ensureColumn(database, 'sites', 'color', "color TEXT DEFAULT '#185FA5'");
  await ensureColumn(database, 'records', 'site_name', 'site_name TEXT');
  await ensureColumn(database, 'records', 'site_color', 'site_color TEXT');
  await ensureColumn(database, 'records', 'unit_price', 'unit_price INTEGER DEFAULT 0');
  await ensureColumn(database, 'records', 'amount', 'amount INTEGER DEFAULT 0');
  await ensureColumn(database, 'records', 'memo', "memo TEXT DEFAULT ''");
  await ensureColumn(database, 'records', 'is_settled', 'is_settled INTEGER DEFAULT 0');
  await ensureColumn(database, 'records', 'is_holiday', 'is_holiday INTEGER DEFAULT 0');

  const countRow = await database.getFirstAsync('SELECT COUNT(*) AS count FROM sites');
  if ((countRow?.count ?? 0) === 0) {
    await database.runAsync(
      'INSERT INTO sites (name, unit_price, color) VALUES (?, ?, ?)',
      [DEFAULT_SITE.name, DEFAULT_SITE.unitPrice, DEFAULT_SITE.color]
    );
  }

  return database;
}

export async function getDB() {
  if (!databasePromise) {
    databasePromise = initializeDatabase();
  }
  return databasePromise;
}

export async function getAppSetting(key, fallbackValue = null) {
  const database = await getDB();
  const row = await database.getFirstAsync(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );

  if (!row || row.value == null) {
    return fallbackValue;
  }

  return row.value;
}

export async function setAppSetting(key, value) {
  const database = await getDB();
  await database.runAsync(
    `
      INSERT OR REPLACE INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `,
    [key, value == null ? null : String(value)]
  );
}

export async function getSites() {
  const database = await getDB();
  return database.getAllAsync('SELECT * FROM sites ORDER BY created_at ASC, id ASC');
}

export async function addSite(name, unitPrice, color) {
  const database = await getDB();
  const result = await database.runAsync(
    'INSERT INTO sites (name, unit_price, color) VALUES (?, ?, ?)',
    [name, unitPrice, color]
  );
  return result.lastInsertRowId;
}

export async function updateSite(id, name, unitPrice, color) {
  const database = await getDB();
  const previous = await database.getFirstAsync(
    'SELECT name, color FROM sites WHERE id = ?',
    [id]
  );

  if (previous) {
    await database.runAsync(
      'UPDATE records SET site_name = COALESCE(site_name, ?), site_color = COALESCE(site_color, ?) WHERE site_id = ?',
      [previous.name, previous.color ?? DEFAULT_SITE.color, id]
    );
  }

  await database.runAsync(
    'UPDATE sites SET name = ?, unit_price = ?, color = ? WHERE id = ?',
    [name, unitPrice, color, id]
  );
}

export async function deleteSite(id) {
  const database = await getDB();
  const existing = await database.getFirstAsync(
    'SELECT name, color FROM sites WHERE id = ?',
    [id]
  );

  if (existing) {
    await database.runAsync(
      'UPDATE records SET site_name = COALESCE(site_name, ?), site_color = COALESCE(site_color, ?) WHERE site_id = ?',
      [existing.name, existing.color ?? DEFAULT_SITE.color, id]
    );
  }

  await database.runAsync('DELETE FROM sites WHERE id = ?', [id]);
}

export async function getRecordsByMonth(year, month) {
  const database = await getDB();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  return database.getAllAsync(
    `
      SELECT
        r.*,
        COALESCE(r.site_name, s.name, '미지정 현장') AS site_name,
        COALESCE(r.site_color, s.color, '#185FA5') AS site_color
      FROM records r
      LEFT JOIN sites s ON r.site_id = s.id
      WHERE r.date LIKE ?
      ORDER BY r.date ASC, r.id ASC
    `,
    [`${prefix}%`]
  );
}

export async function getRecordsByDateRange(startDate, endDate) {
  const database = await getDB();
  return database.getAllAsync(
    `
      SELECT
        r.*,
        COALESCE(r.site_name, s.name, '미지정 현장') AS site_name,
        COALESCE(r.site_color, s.color, '#185FA5') AS site_color
      FROM records r
      LEFT JOIN sites s ON r.site_id = s.id
      WHERE r.date BETWEEN ? AND ?
      ORDER BY r.date ASC, r.id ASC
    `,
    [startDate, endDate]
  );
}

export async function getRecordsByDate(date) {
  const database = await getDB();
  return database.getAllAsync(
    `
      SELECT
        r.*,
        COALESCE(r.site_name, s.name, '미지정 현장') AS site_name,
        COALESCE(r.site_color, s.color, '#185FA5') AS site_color
      FROM records r
      LEFT JOIN sites s ON r.site_id = s.id
      WHERE r.date = ?
      ORDER BY r.id ASC
    `,
    [date]
  );
}

export async function deleteRecordsByDate(date) {
  const database = await getDB();
  await database.runAsync('DELETE FROM records WHERE date = ?', [date]);
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

export async function saveRecords(date, items, memo, isSettled, isHoliday) {
  const database = await getDB();
  const trimmedMemo = String(memo ?? '').trim();

  await database.runAsync('DELETE FROM records WHERE date = ?', [date]);

  const normalizedItems = (items ?? [])
    .map(normalizeItem)
    .filter(
      (item) =>
        item.gongsu > 0 ||
        item.taskName.length > 0 ||
        item.siteId !== null ||
        item.siteName.length > 0
    );

  if (
    normalizedItems.length === 0 &&
    trimmedMemo.length === 0 &&
    !isSettled &&
    !isHoliday
  ) {
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

  for (const item of rows) {
    const amount = Math.round(item.gongsu * item.unitPrice);
    await database.runAsync(
      `
        INSERT INTO records (
          date,
          site_id,
          site_name,
          site_color,
          task_name,
          gongsu,
          unit_price,
          amount,
          memo,
          is_settled,
          is_holiday
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        date,
        item.siteId,
        item.siteName,
        item.siteColor,
        item.taskName,
        item.gongsu,
        item.unitPrice,
        amount,
        trimmedMemo,
        isSettled ? 1 : 0,
        isHoliday ? 1 : 0,
      ]
    );
  }
}

export async function setSettled(date, isSettled) {
  const database = await getDB();
  await database.runAsync(
    'UPDATE records SET is_settled = ? WHERE date = ?',
    [isSettled ? 1 : 0, date]
  );
}

export async function setSettledByMonth(year, month, isSettled) {
  const database = await getDB();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  await database.runAsync(
    'UPDATE records SET is_settled = ? WHERE date LIKE ?',
    [isSettled ? 1 : 0, `${prefix}%`]
  );
}

export async function setSettledByDateRange(startDate, endDate, isSettled) {
  const database = await getDB();
  await database.runAsync(
    'UPDATE records SET is_settled = ? WHERE date BETWEEN ? AND ?',
    [isSettled ? 1 : 0, startDate, endDate]
  );
}

export async function exportBackupData() {
  const database = await getDB();
  const sites = await database.getAllAsync(
    'SELECT id, name, unit_price, color, created_at FROM sites ORDER BY created_at ASC, id ASC'
  );
  const records = await database.getAllAsync(
    `
      SELECT
        id,
        date,
        site_id,
        site_name,
        site_color,
        task_name,
        gongsu,
        unit_price,
        amount,
        memo,
        is_settled,
        is_holiday,
        created_at
      FROM records
      ORDER BY date ASC, id ASC
    `
  );

  return {
    app: 'gongsu-app',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sites,
    records,
  };
}

async function prepareImportedData(payload, source = {}) {
  const imported = isSQLiteImportPayload(payload)
    ? await importSqliteBackupPayload(payload, source)
    : parseAndNormalizeBackupImport(payload, {
        defaultSite: DEFAULT_SITE,
        sourceName: source.name,
      });
  const normalizedSites = imported.sites;
  const normalizedRecords = imported.records;

  if (normalizedSites.length === 0 && normalizedRecords.length === 0) {
    throw new Error('No importable sites or records were found. Check whether the file is JSON or CSV/TSV format.');
  }

  return {
    normalizedSites,
    normalizedRecords,
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

    if (Number.isInteger(numericPreferredId) && numericPreferredId > 0 && !usedIds.has(numericPreferredId)) {
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

function mergeImportedPayload(existingSites, existingRecords, importedSites, importedRecords) {
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

    const createdSite = {
      id: pickSiteId(candidate?.id ?? candidate?.siteId ?? null),
      name,
      unitPrice: Number(candidate?.unitPrice ?? candidate?.unit_price ?? DEFAULT_SITE.unitPrice) || DEFAULT_SITE.unitPrice,
      color: String(candidate?.color ?? candidate?.siteColor ?? candidate?.site_color ?? DEFAULT_SITE.color),
      createdAt: String(candidate?.createdAt ?? candidate?.created_at ?? new Date().toISOString()),
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

export async function previewBackupData(payload, source = {}) {
  const { normalizedSites, normalizedRecords } = await prepareImportedData(payload, source);
  return {
    siteCount: normalizedSites.length,
    recordCount: normalizedRecords.length,
  };
}

async function insertSiteRow(database, site) {
  if (site.id !== null) {
    await database.runAsync(
      `
        INSERT INTO sites (id, name, unit_price, color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [site.id, site.name, site.unitPrice, site.color, site.createdAt]
    );
    return;
  }

  await database.runAsync(
    `
      INSERT INTO sites (name, unit_price, color, created_at)
      VALUES (?, ?, ?, ?)
    `,
    [site.name, site.unitPrice, site.color, site.createdAt]
  );
}

async function insertRecordRow(database, record) {
  if (record.id !== null) {
    await database.runAsync(
      `
        INSERT INTO records (
          id,
          date,
          site_id,
          site_name,
          site_color,
          task_name,
          gongsu,
          unit_price,
          amount,
          memo,
          is_settled,
          is_holiday,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.id,
        record.date,
        record.siteId,
        record.siteName,
        record.siteColor,
        record.taskName,
        record.gongsu,
        record.unitPrice,
        record.amount,
        record.memo,
        record.isSettled,
        record.isHoliday,
        record.createdAt,
      ]
    );
    return;
  }

  await database.runAsync(
    `
      INSERT INTO records (
        date,
        site_id,
        site_name,
        site_color,
        task_name,
        gongsu,
        unit_price,
        amount,
        memo,
        is_settled,
        is_holiday,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      record.date,
      record.siteId,
      record.siteName,
      record.siteColor,
      record.taskName,
      record.gongsu,
      record.unitPrice,
      record.amount,
      record.memo,
      record.isSettled,
      record.isHoliday,
      record.createdAt,
    ]
  );
}

export async function importBackupData(payload, source = {}) {
  const database = await getDB();
  const importMode = source.mode === 'merge' ? 'merge' : 'replace';
  let { normalizedSites, normalizedRecords } = await prepareImportedData(payload, source);

  await database.execAsync('BEGIN TRANSACTION;');

  try {
    if (importMode === 'replace') {
      await database.runAsync('DELETE FROM records');
      await database.runAsync('DELETE FROM sites');
    } else {
      const existingSites = await database.getAllAsync(
        `
          SELECT
            id,
            name,
            unit_price AS unitPrice,
            color,
            created_at AS createdAt
          FROM sites
        `
      );
      const existingRecords = await database.getAllAsync(
        `
          SELECT
            date,
            site_id AS siteId,
            site_name AS siteName,
            site_color AS siteColor,
            task_name AS taskName,
            gongsu,
            unit_price AS unitPrice,
            amount,
            memo,
            is_settled AS isSettled,
            is_holiday AS isHoliday,
            created_at AS createdAt
          FROM records
        `
      );
      const mergedPayload = mergeImportedPayload(
        existingSites,
        existingRecords,
        normalizedSites,
        normalizedRecords
      );

      normalizedSites = mergedPayload.sites;
      normalizedRecords = mergedPayload.records;
    }

    for (const site of normalizedSites) {
      await insertSiteRow(database, site);
    }

    if (importMode === 'replace' && normalizedSites.length === 0) {
      await database.runAsync(
        'INSERT INTO sites (name, unit_price, color) VALUES (?, ?, ?)',
        [DEFAULT_SITE.name, DEFAULT_SITE.unitPrice, DEFAULT_SITE.color]
      );
    }

    for (const record of normalizedRecords) {
      await insertRecordRow(database, record);
    }

    await database.execAsync('COMMIT;');

    return {
      siteCount: normalizedSites.length,
      recordCount: normalizedRecords.length,
    };
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
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
