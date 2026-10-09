// shots-neon.mjs — saves 375x812 screenshots of looks/neon.html: start, 9-tile round, 25-tile round, game over.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })).newPage();
await page.goto(`http://localhost:${server.address().port}/looks/neon.html`);
await page.evaluate(() => document.fonts.ready);
console.log('fonts', await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(',')));
const shot = (n) => page.screenshot({ path: path.join(dir, `looks/shots/neon-${n}.png`) });
const ready = () => page.waitForFunction(() => window.__game.ready);
const tapOdd = async () => { await ready(); await page.tap(`#grid button[data-i="${await page.evaluate(() => window.__game.breakerIndex)}"]`); };
await shot('start');
await page.tap('#play');
for (let r = 1; r < 19; r++) { await tapOdd(); if (r === 8) { await ready(); await page.waitForTimeout(800); await shot('9tile'); } }
await ready(); await page.waitForTimeout(1500); await shot('25tile');
await page.waitForFunction(() => window.__game.state === 'over', null, { timeout: 20000 });
await page.waitForTimeout(300); await shot('gameover');
await browser.close(); server.close();
