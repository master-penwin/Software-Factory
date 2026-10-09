// looks/play-look.mjs — copy of play.mjs for look variants: PAGE=looks/<name>.html (path from game root), LOOK=<name> for shots.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // game root, so ../rules.js resolves
const PAGE = process.env.PAGE || 'looks/geometric.html';
const LOOK = process.env.LOOK || path.basename(PAGE, '.html');
const shot = (n) => path.join(dir, `looks/shots/${LOOK}-${n}.png`);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/${PAGE}`;
fs.mkdirSync(path.join(dir, 'looks/shots'), { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let fails = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const g = (k) => page.evaluate((k) => window.__game[k], k);
const tile = (i) => page.locator(`#grid button[data-i="${i}"]`);
const visibleText = (sel) => page.locator(sel).innerText();

// Waits out the post-render tap lock (no-op on builds without it) before tapping.
const ready = () => page.waitForFunction(() => window.__game.ready ?? window.__game.state === 'round');
const tapOdd = async () => { await ready(); await tile(await g('breakerIndex')).tap(); };
const waitState = (s, timeout = 3000) => page.waitForFunction((s) => window.__game.state === s, s, { timeout });

await page.goto(url);
await page.waitForTimeout(500); // fonts
await page.screenshot({ path: shot('start') });

await check('clear 5 rounds then wrong tap -> game over, score 5', async () => {
  await page.tap('#play');
  for (let r = 0; r < 5; r++) {
    assert((await g('state')) === 'round', `round ${r}: state ${await g('state')}`);
    const box = await tile(await g('breakerIndex')).boundingBox();
    assert(box.width >= 44 && box.height >= 44, `tap target too small: ${box.width}x${box.height}`);
    await tapOdd();
  }
  assert((await g('state')) === 'round', 'should still be playing after 5 rounds');
  
  await ready();
  const bi = await g('breakerIndex');
  await tile(bi === 0 ? 1 : 0).tap();
  await waitState('over');
  assert(await page.locator('#over').isVisible(), 'game over screen hidden');
  assert((await visibleText('#final')) === '5', `score ${await visibleText('#final')}`);
  assert((await visibleText('#best2')) === '5', `best ${await visibleText('#best2')}`);
  await page.screenshot({ path: shot('gameover') });
});

await check('bug4: replay ignores a tap within 200ms of game over', async () => {
  await page.evaluate(() => document.getElementById('replay').click()); // same frame as game over screen
  await page.waitForTimeout(150);
  await page.tap('#replay');
  assert((await g('state')) === 'over', `replay accepted too early: ${await g('state')}`);
  await page.waitForTimeout(400);
});

await check('replay starts a fresh round', async () => {
  await page.tap('#replay');
  assert((await g('state')) === 'round', 'not in round');
  assert((await visibleText('#score')) === '0', 'score not reset');
  assert((await page.locator('#grid button').count()) === 4, 'grid not reset to 4');
});

await check('bug2: timer bar width > 0 at 1s into round 1 (after Replay)', async () => {
  await page.waitForTimeout(1000);
  const w = await page.locator('#timer').evaluate((e) => e.getBoundingClientRect().width);
  const full = await page.locator('.bar').evaluate((e) => e.getBoundingClientRect().width);
  assert(w > full * 0.5 && w < full, `bar ${w}px of ${full}px`);
});

await check('bug1: double tap within 50ms does not end the run', async () => {
  await ready();
  const res = await page.evaluate(async () => {
    const G = window.__game, q = (i) => document.querySelector(`#grid button[data-i="${i}"]`);
    q(G.breakerIndex).click();
    await new Promise((r) => setTimeout(r, 40));
    q(G.breakerIndex === 0 ? 1 : 0).click(); // second tap lands on a wrong tile of the new grid
    return { state: G.state, score: document.getElementById('score').textContent };
  });
  assert(res.state === 'round' && res.score === '1', JSON.stringify(res));
  assert(await page.locator('#grid').evaluate((e) => getComputedStyle(e).touchAction) === 'manipulation', 'no touch-action');
});

await check('bug3: correct tap confirms; wrong tap highlights odd + wrong tile before game over', async () => {
  await tapOdd();
  assert(await page.locator('#grid').evaluate((e) => e.classList.contains('ok')), 'no confirmation on correct tap');
  await ready();
  const bi = await g('breakerIndex'), wi = bi === 0 ? 1 : 0;
  await tile(wi).tap();
  assert(await tile(bi).evaluate((e) => getComputedStyle(e).outlineStyle !== 'none'), 'odd tile not outlined');
  assert(await tile(wi).evaluate((e) => e.classList.contains('wrong')), 'wrong tap not marked');
  assert(await page.locator('#grid').isVisible(), 'grid hidden immediately');
  await page.waitForTimeout(300);
  assert(await tile(bi).isVisible(), 'reveal shorter than 300ms');
  await waitState('over');
});

await check('bug5: top Best updates live past the stored best', async () => {
  await page.reload(); // stored best is 5
  await page.tap('#play');
  for (let r = 0; r < 6; r++) await tapOdd();
  assert((await visibleText('#best1')) === '6', `best ${await visibleText('#best1')}`);
});

await check('reload -> best score persists', async () => {
  await page.reload();
  await page.tap('#play');
  assert((await visibleText('#best1')) === '5', `best ${await visibleText('#best1')}`);
});

await check('timeout -> odd tile shown, then game over', async () => {
  await page.waitForFunction(() => window.__game.state !== 'round', null, { timeout: 8000 });
  assert((await page.locator('#grid button.odd').count()) === 1, 'odd tile not highlighted on timeout');
  await waitState('over');
  assert((await visibleText('#final')) === '0', 'score should be 0');
});

await check('screenshots: 9-tile and 25-tile rounds', async () => {
  await page.reload();
  await page.tap('#play');
  for (let r = 0; r < 24; r++) {
    const n = await page.locator('#grid button').count();
    if (r === 7) /* round 8: 9 tiles */ { await ready(); await page.waitForTimeout(400); await page.screenshot({ path: shot('9') }); }
    if (n === 25) { await ready(); await page.waitForTimeout(400); await page.screenshot({ path: shot('25') }); return; }
    await tapOdd();
  }
  throw new Error('never reached 25 tiles');
});

await check('no console errors', async () => assert(errors.length === 0, errors.join(' | ')));

await browser.close();
server.close();
console.log(fails ? `FAIL (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
