import * as SQLite from 'expo-sqlite';

const DEFAULT_SITE = {
  name: '기본 현장',
  unitPrice: 200000,
  color: '#185FA5',
};

let databasePromise;

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
