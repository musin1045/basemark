export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatMoney(value) {
  const amount = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function formatGongsu(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  const fixed = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(1);
  return fixed.replace(/\.0$/, '');
}

export function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export function shiftDateKey(dateKey, delta) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const nextDate = new Date(year, month - 1, day + delta);
  return `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
}

export function formatDateLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${year}년 ${month}월 ${day}일 (${WEEKDAYS[date.getDay()]})`;
}

export function formatMonthLabel(year, month) {
  return `${year}년 ${month}월`;
}

export function buildCalendarCells(year, month) {
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstDayOfWeek; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
