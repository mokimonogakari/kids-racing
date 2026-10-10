// Renders icons/icon.svg to the PNG icons with Playwright (Chromium).
// Usage: PW_MODULE=/path/to/node_modules/playwright/index.mjs node tools/make-icons.mjs
// (PW_CHROMIUM can point at a chromium executable.)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(process.env.PW_MODULE || 'playwright');
const chromium = pw.chromium || pw.default.chromium;
const svg = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

async function render(file, size, { maskable = false, rounded = true } = {}) {
  let body = svg;
  if (!rounded) body = body.replace('rx="112"', 'rx="0"');
  // Maskable: full-bleed square; the car already sits inside the 80% safe zone.
  if (maskable) body = body.replace('rx="112"', 'rx="0"');
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
