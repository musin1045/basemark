import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9223;
const BASE_URL = 'http://localhost:8081';
const PROFILE_DIR = path.resolve('.store-browser-profile');
const OUTPUT_DIR = path.resolve('store-assets', 'play');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function resetDir(targetPath) {
  await fs.rm(targetPath, {
    recursive: true,
    force: true,
  });
  await ensureDir(targetPath);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

class CDPClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
          return;
        }
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { id, method, params };
    this.socket.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Runtime evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result?.value;
  }

  async screenshot(filename) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await fs.writeFile(path.join(SCREENSHOT_DIR, filename), Buffer.from(data, 'base64'));
  }
}

async function connectToTarget() {
  const targetsUrl = `http://127.0.0.1:${DEBUG_PORT}/json/list`;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetchJson(targetsUrl);
      const pageTarget = targets.find(
        (target) => target.type === 'page' && target.url.startsWith(BASE_URL)
      );
      if (pageTarget?.webSocketDebuggerUrl) {
        const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener(
            'error',
            () => reject(new Error('Failed to connect to browser debugger')),
            { once: true }
          );
        });
        return new CDPClient(socket);
      }
    } catch {}

    await delay(400);
  }

  throw new Error('Could not find a debuggable browser target.');
}

function launchBrowser() {
  return spawn(
    EDGE_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      '--window-size=430,932',
      BASE_URL,
    ],
    {
      stdio: 'ignore',
      detached: false,
    }
  );
}

async function waitFor(client, predicateExpression, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await client.evaluate(predicateExpression);
      if (result) {
        return;
      }
    } catch {}

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function goto(client, relativePath) {
  await client.send('Page.navigate', {
    url: `${BASE_URL}${relativePath}`,
  });
  await delay(1500);
}

function escapeForJs(value) {
  return JSON.stringify(String(value));
}

async function clickByText(client, text) {
  const expression = `
    (() => {
      const expected = ${escapeForJs(text)};
      const nodes = [...document.querySelectorAll('*')]
        .filter((element) => {
          const label = (element.innerText || '').trim();
          if (label !== expected) {
            return false;
          }
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height);
        });

      const rawTarget = nodes[0];
      if (!rawTarget) {
        return false;
      }

      const target =
        rawTarget.closest('a, button, [role="button"], [role="tab"], [tabindex]') || rawTarget;

      target.scrollIntoView({ block: 'center', inline: 'center' });
      ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
      if (typeof target.click === 'function') {
        target.click();
      }
      return true;
    })();
  `;

  const clicked = await client.evaluate(expression);
  if (!clicked) {
    throw new Error(`Could not find clickable text: ${text}`);
  }
  await delay(500);
}

async function setInputValue(client, placeholder, value) {
  const expression = `
    (() => {
      const placeholderText = ${escapeForJs(placeholder)};
      const nextValue = ${escapeForJs(value)};
      const element = [...document.querySelectorAll('input, textarea')]
        .find((candidate) => candidate.getAttribute('placeholder') === placeholderText);
      if (!element) {
        return false;
      }

      element.focus();
      const prototype = element.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor.set.call(element, nextValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.blur();
      return true;
    })();
  `;

  const updated = await client.evaluate(expression);
  if (!updated) {
    throw new Error(`Could not find input with placeholder: ${placeholder}`);
  }
  await delay(350);
}

async function scrollToText(client, text) {
  const expression = `
    (() => {
      const expected = ${escapeForJs(text)};
      const target = [...document.querySelectorAll('*')]
        .find((element) => (element.innerText || '').includes(expected));
      if (!target) {
        return false;
      }
      target.scrollIntoView({ block: 'center', inline: 'center' });
      return true;
    })();
  `;
  await client.evaluate(expression);
  await delay(500);
}

async function setupViewport(client) {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 430,
    screenHeight: 932,
    positionX: 0,
    positionY: 0,
  });
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    configuration: 'mobile',
  });
}

async function createSites(client) {
  await waitFor(
    client,
    `document.body.innerText.includes('오늘 입력')`,
    15000,
    'home screen before navigating to site manager'
  );
  await clickByText(client, '현장');
  await waitFor(
    client,
    `document.body.innerText.includes('현장 관리')`,
    15000,
    'site manager screen'
  );
  await delay(2000);
  await client.screenshot('02-sites.png');
}

async function captureHome(client) {
  await goto(client, '/');
  await waitFor(
    client,
    `document.body.innerText.includes('오늘 입력')`,
    15000,
    'home screen'
  );
  await delay(6000);
  await client.screenshot('01-home.png');
}

async function captureSettlement(client) {
  await clickByText(client, '정산');
  await waitFor(
    client,
    `document.body.innerText.includes('세금/공제 계산') && document.body.innerText.includes('기간 지정')`,
    15000,
    'settlement screen'
  );
  await delay(2000);
  await client.screenshot('03-settle.png');
}

async function captureSettings(client) {
  await clickByText(client, '설정');
  await waitFor(
    client,
    `document.body.innerText.includes('개인정보처리방침')`,
    15000,
    'settings screen'
  );
  await delay(2000);
  await client.screenshot('04-settings-top.png');
  await scrollToText(client, '개인정보처리방침');
  await client.screenshot('05-settings-privacy.png');
}

async function main() {
  await resetDir(PROFILE_DIR);
  await ensureDir(SCREENSHOT_DIR);

  const browser = launchBrowser();
  let client;

  try {
    client = await connectToTarget();
    await setupViewport(client);
    await captureHome(client);
    await createSites(client);
    await captureSettlement(client);
    await captureSettings(client);
  } finally {
    if (client?.socket?.readyState === WebSocket.OPEN) {
      client.socket.close();
    }

    browser.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
