import * as SQLite from 'expo-sqlite';

let db = null;

export async function getDB() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('gongsu.db');
  await initDB(db);
  return db;
}

async function initDB(database) {
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
      task_name TEXT,
      gongsu REAL NOT NULL,
      unit_price INTEGER,
      amount INTEGER,
      memo TEXT,
      is_settled INTEGER DEFAULT 0,
      is_holiday INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default site if none exist
  const count = await database.getFirstAsync('SELECT COUNT(*) as cnt FROM sites');
  if (count.cnt === 0) {
    await database.runAsync(
      "INSERT INTO sites (name, unit_price, color) VALUES (?, ?, ?)",
      ['기본 현장', 200000, '#185FA5']
    );
  }
}

// ─── Sites ───────────────────────────────────────────────────────────────────

export async function getSites() {
  const database = await getDB();
  return await database.getAllAsync('SELECT * FROM sites ORDER BY created_at ASC');
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
  await database.runAsync(
    'UPDATE sites SET name=?, unit_price=?, color=? WHERE id=?',
    [name, unitPrice, color, id]
  );
}

export async function deleteSite(id) {
  const database = await getDB();
  await database.runAsync('DELETE FROM sites WHERE id=?', [id]);
}

// ─── Records ─────────────────────────────────────────────────────────────────

export async function getRecordsByMonth(year, month) {
  const database = await getDB();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return await database.getAllAsync(
    "SELECT r.*, s.name as site_name, s.color as site_color FROM records r LEFT JOIN sites s ON r.site_id = s.id WHERE r.date LIKE ? ORDER BY r.date ASC, r.id ASC",
    [`${prefix}%`]
  );
}

export async function getRecordsByDate(date) {
  const database = await getDB();
  return await database.getAllAsync(
    "SELECT r.*, s.name as site_name, s.color as site_color FROM records r LEFT JOIN sites s ON r.site_id = s.id WHERE r.date = ? ORDER BY r.id ASC",
    [date]
  );
}

export async function saveRecords(date, items, memo, isSettled, isHoliday) {
  const database = await getDB();
  // Delete existing records for this date
  await database.runAsync('DELETE FROM records WHERE date=?', [date]);
  // Insert new records
  for (const item of items) {
    const amount = Math.round((item.gongsu || 0) * (item.unitPrice || 0));
    await database.runAsync(
      'INSERT INTO records (date, site_id, task_name, gongsu, unit_price, amount, memo, is_settled, is_holiday) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        date,
        item.siteId || null,
        item.taskName || '',
        item.gongsu || 0,
        item.unitPrice || 0,
        amount,
        memo || '',
        isSettled ? 1 : 0,
        isHoliday ? 1 : 0,
      ]
    );
  }
}

export async function setSettled(date, isSettled) {
  const database = await getDB();
  await database.runAsync(
    'UPDATE records SET is_settled=? WHERE date=?',
    [isSettled ? 1 : 0, date]
  );
}

export async function setHoliday(date, isHoliday) {
  const database = await getDB();
  await database.runAsync(
    'UPDATE records SET is_holiday=? WHERE date=?',
    [isHoliday ? 1 : 0, date]
  );
}

// ─── Summary helpers ─────────────────────────────────────────────────────────

export function groupByDate(records) {
  const map = {};
  for (const r of records) {
    if (!map[r.date]) {
      map[r.date] = {
        date: r.date,
        totalGongsu: 0,
        totalAmount: 0,
        isSettled: r.is_settled === 1,
        isHoliday: r.is_holiday === 1,
        memo: r.memo,
        items: [],
      };
    }
    map[r.date].totalGongsu += r.gongsu || 0;
    map[r.date].totalAmount += r.amount || 0;
    map[r.date].items.push(r);
  }
  return map;
}
