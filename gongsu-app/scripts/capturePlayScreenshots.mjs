import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { spawn } from 'node:child_process';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9223;
const BASE_URL = 'http://localhost:8081';
const PROFILE_DIR = path.join(os.tmpdir(), 'gongsuro-store-browser-profile');
const OUTPUT_DIR = path.resolve('store-assets', 'play');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
const STORAGE_KEY = 'gongsu-web-db-v1';

const SEEDED_STATE = {
  sites: [
    { id: 1, name: '성수', unit_price: 180000, color: '#185FA5', created_at: '2026-03-01T08:00:00.000Z' },
    { id: 2, name: '광교', unit_price: 165000, color: '#2B7A4B', created_at: '2026-03-02T08:00:00.000Z' },
    { id: 3, name: '분당', unit_price: 200000, color: '#C56A1A', created_at: '2026-03-03T08:00:00.000Z' },
    { id: 4, name: '마포', unit_price: 175000, color: '#7B5CC7', created_at: '2026-03-04T08:00:00.000Z' }
  ],
  records: [
    { id: 1, date: '2026-03-02', site_id: 1, site_name: '성수', site_color: '#185FA5', task_name: '천장', gongsu: 1, unit_price: 180000, amount: 180000, memo: '', is_settled: 1, is_holiday: 0, created_at: '2026-03-02T09:00:00.000Z' },
    { id: 2, date: '2026-03-03', site_id: 2, site_name: '광교', site_color: '#2B7A4B', task_name: '철거', gongsu: 1, unit_price: 165000, amount: 165000, memo: '', is_settled: 1, is_holiday: 0, created_at: '2026-03-03T09:00:00.000Z' },
    { id: 3, date: '2026-03-04', site_id: 3, site_name: '분당', site_color: '#C56A1A', task_name: '배관', gongsu: 1, unit_price: 200000, amount: 200000, memo: '', is_settled: 1, is_holiday: 0, created_at: '2026-03-04T09:00:00.000Z' },
    { id: 4, date: '2026-03-05', site_id: 4, site_name: '마포', site_color: '#7B5CC7', task_name: '도배', gongsu: 1, unit_price: 175000, amount: 175000, memo: '', is_settled: 1, is_holiday: 0, created_at: '2026-03-05T09:00:00.000Z' },
    { id: 5, date: '2026-03-06', site_id: 1, site_name: '성수', site_color: '#185FA5', task_name: '몰딩', gongsu: 0.5, unit_price: 180000, amount: 90000, memo: '', is_settled: 1, is_holiday: 0, created_at: '2026-03-06T09:00:00.000Z' },
    { id: 6, date: '2026-03-09', site_id: 2, site_name: '광교', site_color: '#2B7A4B', task_name: '바닥', gongsu: 1, unit_price: 165000, amount: 165000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-09T09:00:00.000Z' },
    { id: 7, date: '2026-03-10', site_id: 3, site_name: '분당', site_color: '#C56A1A', task_name: '타일', gongsu: 1, unit_price: 200000, amount: 200000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-10T09:00:00.000Z' },
    { id: 8, date: '2026-03-11', site_id: 4, site_name: '마포', site_color: '#7B5CC7', task_name: '문틀', gongsu: 1, unit_price: 175000, amount: 175000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-11T09:00:00.000Z' },
    { id: 9, date: '2026-03-12', site_id: 1, site_name: '성수', site_color: '#185FA5', task_name: '도장', gongsu: 1, unit_price: 180000, amount: 180000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-12T09:00:00.000Z' },
    { id: 10, date: '2026-03-13', site_id: 2, site_name: '광교', site_color: '#2B7A4B', task_name: '마감', gongsu: 1, unit_price: 165000, amount: 165000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-13T09:00:00.000Z' },
    { id: 11, date: '2026-03-16', site_id: 3, site_name: '분당', site_color: '#C56A1A', task_name: '설비', gongsu: 1, unit_price: 200000, amount: 200000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-16T09:00:00.000Z' },
    { id: 12, date: '2026-03-17', site_id: 4, site_name: '마포', site_color: '#7B5CC7', task_name: '수리', gongsu: 1, unit_price: 175000, amount: 175000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-17T09:00:00.000Z' },
    { id: 13, date: '2026-03-18', site_id: 1, site_name: '성수', site_color: '#185FA5', task_name: '천장', gongsu: 1, unit_price: 180000, amount: 180000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-18T09:00:00.000Z' },
    { id: 14, date: '2026-03-19', site_id: 2, site_name: '광교', site_color: '#2B7A4B', task_name: '철거', gongsu: 1, unit_price: 165000, amount: 165000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-19T09:00:00.000Z' },
    { id: 15, date: '2026-03-20', site_id: 3, site_name: '분당', site_color: '#C56A1A', task_name: '배관', gongsu: 1, unit_price: 200000, amount: 200000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-20T09:00:00.000Z' },
    { id: 16, date: '2026-03-23', site_id: 4, site_name: '마포', site_color: '#7B5CC7', task_name: '도배', gongsu: 1, unit_price: 175000, amount: 175000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-23T09:00:00.000Z' },
    { id: 17, date: '2026-03-24', site_id: 1, site_name: '성수', site_color: '#185FA5', task_name: '천장', gongsu: 1, unit_price: 180000, amount: 180000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-24T09:00:00.000Z' },
    { id: 18, date: '2026-03-25', site_id: 2, site_name: '광교', site_color: '#2B7A4B', task_name: '바닥', gongsu: 1, unit_price: 165000, amount: 165000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-25T09:00:00.000Z' },
    { id: 19, date: '2026-03-26', site_id: 3, site_name: '분당', site_color: '#C56A1A', task_name: '타일', gongsu: 1, unit_price: 200000, amount: 200000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-26T09:00:00.000Z' },
    { id: 20, date: '2026-03-27', site_id: 4, site_name: '마포', site_color: '#7B5CC7', task_name: '문틀', gongsu: 1, unit_price: 175000, amount: 175000, memo: '', is_settled: 0, is_holiday: 0, created_at: '2026-03-27T09:00:00.000Z' }
  ],
  app_settings: {},
  counters: { site: 5, record: 21 }
};

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function ensureDir(targetPath) { await fs.mkdir(targetPath, { recursive: true }); }
async function resetDir(targetPath) { await fs.rm(targetPath, { recursive: true, force: true }); await ensureDir(targetPath); }
async function fetchJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`); return response.json(); }
class CDPClient {
  constructor(socket) { this.socket = socket; this.nextId = 1; this.pending = new Map(); socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && this.pending.has(message.id)) { const pending = this.pending.get(message.id); this.pending.delete(message.id); if (message.error) { pending.reject(new Error(message.error.message)); return; } pending.resolve(message.result); } }); }
  send(method, params = {}) { const id = this.nextId++; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); }); }
  async evaluate(expression) { const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(`Runtime evaluate failed: ${JSON.stringify(result.exceptionDetails)}`); return result.result?.value; }
  async screenshot(filename) { const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(path.join(SCREENSHOT_DIR, filename), Buffer.from(data, 'base64')); }
}
async function connectToTarget() {
  const targetsUrl = `http://127.0.0.1:${DEBUG_PORT}/json/list`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetchJson(targetsUrl);
      const pageTarget = targets.find((target) => target.type === 'page' && target.url.startsWith(BASE_URL));
      if (pageTarget?.webSocketDebuggerUrl) {
        const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Failed to connect to browser debugger')), { once: true }); });
        return new CDPClient(socket);
      }
    } catch {}
    await delay(400);
  }
  throw new Error('Could not find a debuggable browser target.');
}
function launchBrowser() {
  return spawn(EDGE_PATH, ['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${PROFILE_DIR}`,'--window-size=430,932',BASE_URL], { stdio: 'ignore', detached: false });
}
async function waitFor(client, predicateExpression, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { try { const result = await client.evaluate(predicateExpression); if (result) return; } catch {} await delay(250); }
  throw new Error(`Timed out waiting for ${description}`);
}
async function goto(client, relativePath) { await client.send('Page.navigate', { url: `${BASE_URL}${relativePath}` }); await delay(1800); }
function escapeForJs(value) { return JSON.stringify(String(value)); }
async function clickByText(client, text) {
  const expression = `(() => { const expected = ${escapeForJs(text)}; const nodes = [...document.querySelectorAll('*')].filter((element) => { const label = (element.innerText || '').trim(); if (label !== expected) return false; const style = window.getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden'; }).sort((left, right) => { const leftRect = left.getBoundingClientRect(); const rightRect = right.getBoundingClientRect(); return (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height); }); const rawTarget = nodes[0]; if (!rawTarget) return false; const target = rawTarget.closest('a, button, [role="button"], [role="tab"], [tabindex]') || rawTarget; target.scrollIntoView({ block: 'center', inline: 'center' }); ['pointerdown','mousedown','mouseup','click'].forEach((type) => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); }); if (typeof target.click === 'function') target.click(); return true; })();`;
  const clicked = await client.evaluate(expression); if (!clicked) throw new Error(`Could not find clickable text: ${text}`); await delay(600);
}
async function scrollToText(client, text) { const expression = `(() => { const expected = ${escapeForJs(text)}; const target = [...document.querySelectorAll('*')].find((element) => (element.innerText || '').includes(expected)); if (!target) return false; target.scrollIntoView({ block: 'center', inline: 'center' }); return true; })();`; await client.evaluate(expression); await delay(500); }
async function setupViewport(client) {
  await client.send('Page.enable'); await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932, positionX: 0, positionY: 0 });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' });
}
async function seedDemoData(client) { await client.evaluate(`(() => { localStorage.setItem(${escapeForJs(STORAGE_KEY)}, ${escapeForJs(JSON.stringify(SEEDED_STATE))}); return true; })();`); }
async function captureHome(client) { await goto(client, '/'); await seedDemoData(client); await goto(client, '/'); await waitFor(client, `document.body.innerText.includes('오늘 입력')`, 15000, 'home screen'); await delay(1200); await client.screenshot('01-home.png'); }
async function captureSites(client) { await clickByText(client, '현장'); await waitFor(client, `document.body.innerText.includes('현장 관리')`, 15000, 'sites screen'); await delay(1200); await client.screenshot('02-sites.png'); }
async function captureSettlement(client) { await clickByText(client, '정산'); await waitFor(client, `document.body.innerText.includes('세금/공제 계산') && document.body.innerText.includes('기간 지정')`, 15000, 'settlement screen'); await delay(1200); await client.screenshot('03-settle.png'); }
async function captureSettings(client) { await clickByText(client, '설정'); await waitFor(client, `document.body.innerText.includes('개인정보처리방침')`, 15000, 'settings screen'); await delay(1200); await client.screenshot('04-settings-top.png'); await scrollToText(client, '개인정보처리방침'); await delay(600); await client.screenshot('05-settings-privacy.png'); }
async function main() { await resetDir(PROFILE_DIR); await ensureDir(SCREENSHOT_DIR); const browser = launchBrowser(); let client; try { client = await connectToTarget(); await setupViewport(client); await captureHome(client); await captureSites(client); await captureSettlement(client); await captureSettings(client); } finally { if (client?.socket?.readyState === WebSocket.OPEN) client.socket.close(); browser.kill('SIGTERM'); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
