#!/usr/bin/env node
// Browser smoke test: serves the game, plays a whole race in headless Chrome
// (portrait + landscape), takes screenshots of every screen and reports
// console / page / network errors as JSON.
//
//   node tools/verify.mjs [rootDir] [--out /path/to/shots]
//
// Env: PW_MODULE (playwright entry), CHROME (chrome executable).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
// Default root: the repository that contains this script.
let ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let OUT = '/home/claude/shots/verify';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') OUT = path.resolve(args[++i]);
  else if (!args[i].startsWith('--')) ROOT = path.resolve(args[i]);
}
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.log(JSON.stringify({ ok: false, errors: [{ kind: 'fatal', text: `no index.html in ${ROOT}` }] }));
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  const candidates = [process.env.PW_MODULE, '/opt/npm-tools/node_modules/playwright/index.mjs', '/opt/npm-tools/node_modules/playwright/index.js', 'playwright'].filter(Boolean);
  let last;
  for (const c of candidates) {
    try {
      return await import(c);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const VIEWPORTS = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { name: 'landscape', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 },
];
const SEL_TIMEOUT = 15000;
const GOAL_TIMEOUT = 90000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runViewport(browser, base, vp, summary) {
  const errors = summary.errors;
  const shots = summary.shots;
  const dir = path.join(OUT, vp.name);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, locale: 'ja-JP' });
  const page = await context.newPage();
  const tag = (kind, text) => errors.push({ viewport: vp.name, kind, text: String(text).slice(0, 500) });
  page.on('console', (m) => {
    if (m.type() === 'error') tag('console', m.text());
  });
  page.on('pageerror', (e) => tag('pageerror', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  page.on('requestfailed', (r) => {
    const f = r.failure();
    const txt = (f && f.errorText) || 'failed';
    if (txt.includes('ERR_ABORTED')) return; // navigations / cancelled fetches are not failures
    tag('requestfailed', `${r.url()} ${txt}`);
  });
  const shot = async (name) => {
    const file = path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    shots.push(file);
  };
  const step = async (name, fn) => {
    try {
      await fn();
      summary.steps.push({ viewport: vp.name, step: name, ok: true });
    } catch (e) {
      summary.steps.push({ viewport: vp.name, step: name, ok: false });
      tag('step:' + name, e && e.message ? e.message.split('\n')[0] : e);
    }
  };
  const visible = (sel) => page.waitForSelector(`${sel}:not([hidden])`, { timeout: SEL_TIMEOUT, state: 'visible' });
  const hold = async (sel, ms) => {
    const box = await (await page.waitForSelector(sel, { timeout: SEL_TIMEOUT })).boundingBox();
    if (!box) throw new Error(`no box for ${sel}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(ms);
    await page.mouse.up();
  };

  await step('open', async () => {
    await page.goto(`${base}/index.html?fast=1&nosw=1&seed=5`, { waitUntil: 'load', timeout: SEL_TIMEOUT });
    await visible('#scr-title');
    await sleep(600);
    await shot('title');
  });
  await step('vehicle', async () => {
    await page.click('#btn-start');
    await visible('#scr-vehicle');
    await sleep(400);
    await shot('vehicle');
    await page.locator('.vehicle-card').nth(1).click();
  });
  await step('course', async () => {
    await visible('#scr-course');
    await sleep(400);
    await shot('course');
    await page.locator('.course-card').nth(0).click();
  });
  await step('race', async () => {
    await visible('#scr-race');
    const t0 = Date.now();
    await sleep(1000);
    await shot('countdown');
    await hold('.steer-left', 1500);
    const rest = 6000 - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    await shot('racing');
    await page.click('#btn-honk');
    await sleep(300);
    await shot('racing-honk');
  });
  await step('goal', async () => {
    await page.waitForFunction(() => window.__kr && window.__kr.app && window.__kr.app.screen === 'goal', null, { timeout: GOAL_TIMEOUT });
    await sleep(3000);
    await shot('goal');
    summary.result[vp.name] = await page.evaluate(() => {
      const r = window.__kr && window.__kr.race;
      try {
        return r && typeof r.result === 'function' ? JSON.parse(JSON.stringify(r.result())) : null;
      } catch (e) {
        return { error: String(e) };
      }
    });
  });
  await step('other-vehicle', async () => {
    await page.click('#btn-other');
    await visible('#scr-vehicle');
    await page.click('#scr-vehicle [data-go="title"]');
    await visible('#scr-title');
  });
  await step('book', async () => {
    await page.click('#btn-book');
    await visible('#scr-book');
    await sleep(500);
    await shot('book');
    await page.click('#scr-book [data-go="title"]');
    await visible('#scr-title');
  });
  await step('settings', async () => {
    await hold('#gear', 2300);
    await visible('#settings');
    await sleep(300);
    await shot('settings');
    await page.click('#btn-close');
    await page.waitForSelector('#settings', { state: 'hidden', timeout: SEL_TIMEOUT });
  });
  await context.close();
}

async function main() {
  const started = Date.now();
  const summary = { ok: false, root: ROOT, out: OUT, errors: [], shots: [], result: {}, steps: [] };
  const pw = await loadPlaywright();
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await pw.chromium.launch({
      executablePath: process.env.CHROME || '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    });
    for (const vp of VIEWPORTS) {
      try {
        await runViewport(browser, base, vp, summary);
      } catch (e) {
        summary.errors.push({ viewport: vp.name, kind: 'fatal', text: String(e && e.message || e) });
      }
    }
  } catch (e) {
    summary.errors.push({ kind: 'fatal', text: String(e && e.message || e) });
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
  summary.ok = summary.errors.length === 0;
  summary.durationMs = Date.now() - started;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, errors: [{ kind: 'fatal', text: String(e && e.stack || e) }] }, null, 2));
  process.exit(1);
});
