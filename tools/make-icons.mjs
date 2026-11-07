// Renders icons/icon.svg to the PNG icons with Playwright (Chromium / Chrome).
// Usage: PW_MODULE=/path/to/node_modules/playwright/index.mjs node tools/make-icons.mjs
//   CHROME=/usr/bin/google-chrome  (or PW_CHROMIUM) points at a browser executable.
//   PW_ARGS="--no-sandbox"          extra launch arguments (space separated).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(process.env.PW_MODULE || 'playwright');
const chromium = pw.chromium || pw.default.chromium;
const svg = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
const exe = process.env.CHROME || process.env.PW_CHROMIUM;
const args = (process.env.PW_ARGS || '').split(/\s+/).filter(Boolean);
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args });
const page = await browser.newPage();

// Maskable icons may be cropped to a circle: shrink the artwork (not the background)
// so the car, flag and medal stay inside the 80% safe zone.
const MASKABLE_SCALE = 0.84;

async function render(file, size, { maskable = false, rounded = true } = {}) {
  let body = svg;
  if (!rounded || maskable) body = body.replace('rx="112"', 'rx="0"');
  if (maskable) {
    body = body.replace('<g id="art">', `<g id="art" transform="translate(256 256) scale(${MASKABLE_SCALE}) translate(-256 -256)">`);
  }
  const inner = `<div style="width:${size}px;height:${size}px">${body}</div>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.addStyleTag({ content: 'svg{width:100%;height:100%;display:block}' });
  const buf = await page.screenshot({ omitBackground: !maskable && rounded, clip: { x: 0, y: 0, width: size, height: size } });
  await writeFile(path.join(root, 'icons', file), buf);
  console.log('wrote', file);
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await render('apple-touch-icon.png', 180, { rounded: false });
await browser.close();
