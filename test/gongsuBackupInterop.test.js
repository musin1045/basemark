import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../gongsu-app/node_modules/xlsx/xlsx.mjs';

import {
  normalizeBackupImport,
  parseAndNormalizeBackupImport,
  parseBackupJsonText,
} from '../gongsu-app/src/db/backupInterop.mjs';

test('parseBackupJsonText handles BOM and fenced JSON blocks', () => {
  const payload = parseBackupJsonText(`
\uFEFF백업 복사본

\`\`\`json
{
  "records": [
    {
      "date": "2026/03/22",
      "site": "판교 A",
      "task": "도배",
      "gongsu": "1.5",
      "price": "220000"
    }
  ]
}
\`\`\`
  `);

  assert.equal(payload.records[0].task, '도배');
  assert.equal(payload.records[0].site, '판교 A');
});

test('parseBackupJsonText accepts json5-style backup text', () => {
  const payload = parseBackupJsonText(`
// other app export
{
  records: [
    {
      day: '2026-03-22',
      site: '성수 현장',
      title: '필름 작업',
      workload: 1,
      dailyRate: 230000,
    },
  ],
}
  `);

  assert.equal(payload.records[0].site, '성수 현장');
  assert.equal(payload.records[0].dailyRate, 230000);
});

test('normalizeBackupImport returns empty arrays for null payloads', () => {
  const normalized = normalizeBackupImport(null);

  assert.deepEqual(normalized, {
    sites: [],
    records: [],
  });
});

test('normalizeBackupImport returns empty arrays for empty objects', () => {
  const normalized = normalizeBackupImport({});

  assert.deepEqual(normalized, {
    sites: [],
    records: [],
  });
});

test('normalizeBackupImport reads wrapped foreign app backups with date maps', () => {
  const normalized = normalizeBackupImport({
    backupData: {
      jobSites: {
        alpha: {
          name: '판교 A',
          dailyRate: 250000,
          color: '#123456',
        },
      },
      recordsByDate: {
        '2026.03.21': {
          memo: '오전 작업',
          settled: 'true',
          items: [
            {
              site: '판교 A',
              work: '도배',
              gongsu: '1.5',
            },
            {
              siteName: '판교 A',
              taskName: '정리',
              qty: '0.5',
              unitPrice: 250000,
            },
          ],
        },
      },
    },
  });

  assert.equal(normalized.sites.length, 1);
  assert.equal(normalized.sites[0].name, '판교 A');
  assert.equal(normalized.records.length, 2);
  assert.equal(normalized.records[0].date, '2026-03-21');
  assert.equal(normalized.records[0].isSettled, 1);
  assert.equal(normalized.records[1].gongsu, 0.5);
});

test('parseAndNormalizeBackupImport derives site rows from record-only backups', () => {
  const normalized = parseAndNormalizeBackupImport(`
{
  "entries": [
    {
      "day": "20260322",
      "site": "을지로 현장",
      "title": "샘플 작업",
      "workload": 1,
      "dailyRate": 200000
    }
  ]
}
  `);

  assert.equal(normalized.sites.length, 1);
  assert.equal(normalized.sites[0].name, '을지로 현장');
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].date, '2026-03-22');
  assert.equal(normalized.records[0].siteId, normalized.sites[0].id);
});

test('parseAndNormalizeBackupImport reads CSV sheets exported from spreadsheet apps', () => {
  const normalized = parseAndNormalizeBackupImport(`
date,site,task,gongsu,unitPrice,amount,memo,isSettled
2026-03-22,"Site A","Form work",1.5,"220,000","330,000","first, shift",true
  `);

  assert.equal(normalized.sites.length, 1);
  assert.equal(normalized.sites[0].name, 'Site A');
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].gongsu, 1.5);
  assert.equal(normalized.records[0].unitPrice, 220000);
  assert.equal(normalized.records[0].amount, 330000);
  assert.equal(normalized.records[0].memo, 'first, shift');
  assert.equal(normalized.records[0].isSettled, 1);
});

test('parseAndNormalizeBackupImport reads TSV sheets with Korean column names', () => {
  const normalized = parseAndNormalizeBackupImport(
    [
      '날짜\t현장\t작업\t공수\t단가\t메모\t정산\t휴무',
      '2026년 3월 23일\t현장 B\t정리\t0.5\t210000\thalf day\t정산\t',
    ].join('\n')
  );

  assert.equal(normalized.sites.length, 1);
  assert.equal(normalized.sites[0].name, '현장 B');
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].date, '2026-03-23');
  assert.equal(normalized.records[0].taskName, '정리');
  assert.equal(normalized.records[0].gongsu, 0.5);
  assert.equal(normalized.records[0].unitPrice, 210000);
  assert.equal(normalized.records[0].isSettled, 1);
});

test('parseAndNormalizeBackupImport reads XLSX workbook backups directly', () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['날짜', '현장', '작업', '공수', '단가', '메모', '정산'],
    ['2026-03-24', '현장 C', '타설', 1, 240000, 'xlsx import', '정산'],
  ]);

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Backup');

  const workbookBase64 = XLSX.write(workbook, {
    type: 'base64',
    bookType: 'xlsx',
  });

  const normalized = parseAndNormalizeBackupImport({
    workbookBase64,
  });

  assert.equal(normalized.sites.length, 1);
  assert.equal(normalized.sites[0].name, '현장 C');
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].taskName, '타설');
  assert.equal(normalized.records[0].unitPrice, 240000);
  assert.equal(normalized.records[0].memo, 'xlsx import');
  assert.equal(normalized.records[0].isSettled, 1);
});

test('normalizeBackupImport reads unix timestamp amount rows from sqlite-like backups', () => {
  const normalized = normalizeBackupImport({
    records: [
      {
        timestamp: 1774449600000,
        amount: 250000,
        event_type: '도배',
        memo: 'sqlite row',
      },
    ],
  });

  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].date, '2026-03-25');
  assert.equal(normalized.records[0].amount, 250000);
  assert.equal(normalized.records[0].taskName, '도배');
  assert.equal(normalized.records[0].memo, 'sqlite row');
});

test('normalizeBackupImport reads compact numeric dates from sqlite-like rows', () => {
  const normalized = normalizeBackupImport({
    records: [
      {
        startTS: 20230102,
        site: 'Site A',
        amount: 1,
        price: 160000,
      },
    ],
  });

  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].date, '2023-01-02');
  assert.equal(normalized.records[0].gongsu, 1);
  assert.equal(normalized.records[0].unitPrice, 160000);
  assert.equal(normalized.records[0].amount, 160000);
});

test('normalizeBackupImport infers date from unknown timestamp columns', () => {
  const normalized = normalizeBackupImport({
    records: [
      {
        when_ms: 1774449600000,
        location_label: '샘플 현장',
        price: 230000,
        note_text: 'fallback date',
      },
    ],
  });

  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].date, '2026-03-25');
});
