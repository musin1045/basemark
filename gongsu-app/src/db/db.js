import * as SQLite from 'expo-sqlite';

const DEFAULT_SITE = {
  name: '기본 현장',
  unitPrice: 200000,
  color: '#185FA5',
};

let databasePromise;

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

export async function importBackupData(payload) {
  const database = await getDB();
  const extracted = extractBackupArrays(payload);
  const normalizedSites = extracted.sites
    .map(normalizeSiteBackup)
    .filter(Boolean);
  const normalizedRecords = extracted.records
    .map(normalizeRecordBackup)
    .filter(Boolean);

  if (normalizedSites.length === 0 && normalizedRecords.length === 0) {
    throw new Error('가져올 수 있는 사이트나 기록이 없습니다. JSON 형식을 확인해 주세요.');
  }

  await database.execAsync('BEGIN TRANSACTION;');

  try {
    await database.runAsync('DELETE FROM records');
    await database.runAsync('DELETE FROM sites');

    for (const site of normalizedSites) {
      if (site.id !== null) {
        await database.runAsync(
          `
            INSERT INTO sites (id, name, unit_price, color, created_at)
            VALUES (?, ?, ?, ?, ?)
          `,
          [site.id, site.name, site.unitPrice, site.color, site.createdAt]
        );
      } else {
        await database.runAsync(
          `
            INSERT INTO sites (name, unit_price, color, created_at)
            VALUES (?, ?, ?, ?)
          `,
          [site.name, site.unitPrice, site.color, site.createdAt]
        );
      }
    }

    if (normalizedSites.length === 0) {
      await database.runAsync(
        'INSERT INTO sites (name, unit_price, color) VALUES (?, ?, ?)',
        [DEFAULT_SITE.name, DEFAULT_SITE.unitPrice, DEFAULT_SITE.color]
      );
    }

    for (const record of normalizedRecords) {
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
      } else {
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
