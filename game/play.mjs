// play.mjs — Playwright check for slices 2 and 5: plays the loop at 375x812 and prints PASS/FAIL per case.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;
fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });

const browser = await chromium.launch();
const errors = [];
// Each context is a fresh browser profile (empty localStorage) = a first launch.
async function newPage(opts = {}) {
  const p = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, ...opts })).newPage();
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('pageerror', (e) => errors.push(String(e)));
  return p;
}
let page = await newPage();

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

await check('clear 5 rounds then wrong tap -> game over, score 5', async () => {
  await page.tap('#play');
  for (let r = 0; r < 5; r++) {
    assert((await g('state')) === 'round', `round ${r}: state ${await g('state')}`);
    const box = await tile(await g('breakerIndex')).boundingBox();
    assert(box.width >= 44 && box.height >= 44, `tap target too small: ${box.width}x${box.height}`);
    await tapOdd();
  }
  assert((await g('state')) === 'round', 'should still be playing after 5 rounds');
  await page.screenshot({ path: path.join(dir, 'shots/play.png') });
  await ready();
  const bi = await g('breakerIndex');
  await tile(bi === 0 ? 1 : 0).tap();
  await waitState('over');
  assert(await page.locator('#over').isVisible(), 'game over screen hidden');
  assert((await visibleText('#final')) === '5', `score ${await visibleText('#final')}`);
  assert((await visibleText('#best2')) === '5', `best ${await visibleText('#best2')}`);
  await page.screenshot({ path: path.join(dir, 'shots/gameover.png') });
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

// ---------------- slice 5: polish ----------------
const RULE_NAME = { count: 'Count', symmetry: 'Mirror', parity: 'Odd / even' };
const hintShown = async () => (await page.locator('#hint').isVisible()) && (await g('hint')) !== '';

await check('rule label matches __game.rule every round (rounds 1-12, incl. parity debut)', async () => {
  page = await newPage();
  await page.goto(url);
  await page.tap('#play');
  const seenRules = new Set();
  for (let r = 1; r <= 12; r++) {
    await ready();
    const rule = await g('rule'), label = await visibleText('#ruleName');
    assert(label === RULE_NAME[rule], `round ${r}: label "${label}" vs rule ${rule}`);
    seenRules.add(rule);
    if (r === 10) assert(rule === 'parity', `round 10 rule ${rule}`);
    await tapOdd();
  }
  assert(seenRules.size === 3, `rules seen: ${[...seenRules]}`);
});

await check('label flashes accent on a block start only', async () => {
  page = await newPage();
  await page.goto(url);
  await page.tap('#play');
  assert(await page.locator('#rulebox').evaluate((e) => e.classList.contains('flash')), 'no flash on round 1');
  await page.waitForTimeout(800);
  assert(!(await page.locator('#rulebox').evaluate((e) => e.classList.contains('flash'))), 'flash did not clear');
  await tapOdd(); // round 2: same block
  assert(!(await page.locator('#rulebox').evaluate((e) => e.classList.contains('flash'))), 'flashed mid-block');
});

await check("hint shows on a rule's first appearance only (block-long; parity direction matches grid)", async () => {
  page = await newPage();
  await page.goto(url);
  await page.tap('#play');
  for (let r = 1; r <= 12; r++) {
    await ready();
    const rule = await g('rule'), shown = await hintShown();
    const first = r <= 6 || r >= 10; // count 1-3, symmetry 4-6 debut; 7-9 repeats a seen rule; parity debuts 10-12
    assert(shown === first, `round ${r} (${rule}): hint ${shown ? 'shown' : 'hidden'}`);
    if (rule === 'parity') {
      const oddCount = await page.evaluate(() =>
        document.querySelector(`#grid button[data-i="${window.__game.breakerIndex}"] svg`).childElementCount % 2 === 1);
      const text = await visibleText('#hint');
      assert(text.startsWith(oddCount ? 'One tile has an odd count' : 'One tile has an even count'), `parity hint "${text}"`);
    }
    await tapOdd();
  }
  await page.reload(); // all three seen: no hints on any later run
  await page.tap('#play');
  for (let r = 1; r <= 12; r++) {
    await ready();
    assert(!(await hintShown()), `after reload, round ${r}: hint shown`);
    await tapOdd();
  }
});

await check('tutorial: first launch only; clock waits for first tap or 1.5s', async () => {
  page = await newPage();
  await page.goto(url);
  await page.tap('#play');
  assert((await g('tutorial')) === true, 'no tutorial on first launch');
  assert(await hintShown(), 'no hint in tutorial round 1');
  await page.waitForTimeout(600);
  assert((await g('clockOn')) === false, 'clock started before any tap / 1.5s');
  const full = await page.locator('.bar').evaluate((e) => e.getBoundingClientRect().width);
  assert((await page.locator('#timer').evaluate((e) => e.getBoundingClientRect().width)) === full, 'bar moved while waiting');
  await page.tap('#rulebox'); // a tap anywhere starts it
  await page.waitForTimeout(50);
  assert((await g('clockOn')) === true, 'tap did not start the clock');
  await tapOdd(); // round 2: no tap -> starts at 1.5s
  await page.waitForTimeout(1200);
  assert((await g('clockOn')) === false, 'round 2 clock started before 1.5s');
  await page.waitForTimeout(500);
  assert((await g('clockOn')) === true, 'round 2 clock not started by 1.7s');
  await tapOdd(); await tapOdd(); // round 4: tutorial over, but Mirror's first-ever round still waits (PM #3)
  await page.waitForTimeout(400);
  assert((await g('clockOn')) === false, 'round 4 (Mirror debut) did not wait');
  await tapOdd(); // round 5: no wait
  await page.waitForTimeout(350);
  assert((await g('clockOn')) === true, 'round 5 still waiting');
  await ready(); await tile((await g('breakerIndex')) === 0 ? 1 : 0).tap();
  await waitState('over'); await page.waitForTimeout(550);
  await page.tap('#replay'); // second run of the first launch: no tutorial
  assert((await g('tutorial')) === false, 'tutorial on replay');
  await page.reload();
  await page.tap('#play');
  assert((await g('tutorial')) === false, 'tutorial after reload');
});

await check('clock starts after tiles are visible, not before (fairness)', async () => {
  // page: reloaded, non-tutorial run. Measure render -> clock start.
  const t = await page.evaluate(async () => {
    const G = window.__game, q = (i) => document.querySelector(`#grid button[data-i="${i}"]`);
    while (!G.ready) await new Promise((r) => setTimeout(r, 10));
    q(G.breakerIndex).click();
    const t0 = performance.now(), atRender = G.clockOn;
    while (!G.clockOn) await new Promise((r) => requestAnimationFrame(r));
    const anims = [...document.querySelectorAll('#grid button')].flatMap((b) => b.getAnimations()).filter((a) => a.playState === 'running');
    return { atRender, wait: performance.now() - t0, running: anims.length };
  });
  assert(!t.atRender && t.wait >= 140 && t.wait < 300 && t.running === 0, JSON.stringify(t));
});

await check("'?' on start screen shows the 3 hints", async () => {
  await page.reload();
  assert(!(await page.locator('#help').isVisible()), 'help open by default');
  await page.tap('#how');
  assert(await page.locator('#help').isVisible(), 'help hidden after ?');
  const names = await page.locator('#help b').allInnerTexts();
  assert(names.join('|') === 'Count|Mirror|Odd / even', names.join('|'));
  await page.tap('#how');
  assert(!(await page.locator('#help').isVisible()), 'help did not close');
});

await check('mute persists across reload', async () => {
  assert((await g('muted')) === false, 'muted by default');
  await page.tap('#mute');
  assert((await g('muted')) === true && (await page.getAttribute('#mute', 'aria-pressed')) === 'true', 'mute did not toggle');
  await page.reload();
  assert((await g('muted')) === true && (await page.getAttribute('#mute', 'aria-pressed')) === 'true', 'mute not remembered');
  await page.tap('#mute');
  await page.reload();
  assert((await g('muted')) === false, 'unmute not remembered');
});

await check('sound: AudioContext only after a user gesture, then running', async () => {
  page = await newPage();
  await page.addInitScript(() => {
    const A = window.AudioContext; window.__acs = [];
    window.AudioContext = class extends A { constructor(...a) { super(...a); window.__acs.push(this); } };
  });
  await page.goto(url);
  await page.waitForTimeout(200);
  assert((await page.evaluate(() => window.__acs.length)) === 0, 'AudioContext created before a gesture');
  await page.tap('#play');
  await page.waitForTimeout(100);
  const st = await page.evaluate(() => window.__acs.map((a) => a.state));
  assert(st.length === 1 && st[0] === 'running', JSON.stringify(st));
  await tapOdd(); // plays the click; must not throw
});

await check('reduced motion: no tile/score animation, clock starts at once, game plays', async () => {
  page = await newPage({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.evaluate(() => { localStorage.setItem('launched', '1'); localStorage.setItem('seenRules', '["count","symmetry","parity"]'); }); // skip tutorial waits
  await page.reload();
  await page.tap('#play');
  await page.waitForTimeout(320); // tap lock is 250ms; no intro wait on top of it
  assert((await g('clockOn')) === true, 'clock waited for an intro that does not play');
  const names = await page.locator('#grid button').evaluateAll((bs) => bs.map((b) => getComputedStyle(b).animationName));
  assert(names.every((n) => n === 'none'), names.join(','));
  await tapOdd();
  assert((await page.locator('#score').evaluate((e) => getComputedStyle(e).animationName)) === 'none', 'score animates');
  const pulse = await page.locator('.pulse').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).animationName));
  assert(pulse.every((n) => n === 'pulse-rm'), `pulse ${pulse}`);
  await tapOdd(); await tapOdd();
  assert((await visibleText('#score')) === '3', 'did not play 3 rounds');
});

// ---------------- first-time-player review fixes ----------------
const fresh = async (storage = {}, opts) => { // new profile with given localStorage, on the start screen
  page = await newPage(opts);
  await page.goto(url);
  await page.evaluate((st) => { for (const k in st) localStorage.setItem(k, st[k]); }, storage);
  await page.reload();
};
const SEEN_ALL = { launched: '1', seenRules: '["count","symmetry","parity"]' };

await check('fix1: reveal lasts ~1.2s; game over names the cause; "New best" only when beaten', async () => {
  await fresh({ ...SEEN_ALL, best: '1' });
  await page.tap('#play');
  await tapOdd(); await tapOdd(); // score 2 > stored best 1
  await ready(); await tile((await g('breakerIndex')) === 0 ? 1 : 0).tap();
  await page.waitForTimeout(1000);
  assert((await g('state')) === 'reveal', `reveal ended before 1s: ${await g('state')}`);
  await waitState('over', 600);
  assert((await visibleText('#reason')) === 'Wrong tile', `reason "${await visibleText('#reason')}"`);
  assert((await visibleText('#bestLabel')).toLowerCase() === 'new best', `best label "${await visibleText('#bestLabel')}"`);
  await page.waitForTimeout(550);
  await page.tap('#replay'); // let the clock run out at score 0: not a new best
  await waitState('over', 12000);
  assert((await visibleText('#reason')).toLowerCase() === "time's up", `reason "${await visibleText('#reason')}"`);
  assert((await visibleText('#bestLabel')).toLowerCase() === 'best', `best label "${await visibleText('#bestLabel')}"`);
});

await check('fix2: start copy says grids are timed; bar 5px; bar flashes accent in the last 1.5s', async () => {
  await fresh(SEEN_ALL);
  const lede = await page.locator('#start').innerText();
  assert(lede.includes('Each grid is timed — one miss ends the run'), 'timed copy missing');
  await page.tap('#play');
  assert((await page.locator('.bar').evaluate((e) => e.getBoundingClientRect().height)) === 5, 'bar not 5px');
  const accent = await page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--accent)';
    document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  const colors = () => page.evaluate(async () => { const out = new Set(), b = document.getElementById('timer');
    for (let i = 0; i < 12; i++) { out.add(getComputedStyle(b).backgroundColor); await new Promise((r) => setTimeout(r, 50)); } return [...out]; });
  await page.waitForTimeout(500); // round 1 is 6s: well before the last 1.5s
  assert(!(await colors()).includes(accent), 'accent before the last 1.5s');
  await page.waitForTimeout(4400); // ~5.5s in: inside the last 1.5s
  assert((await g('state')) === 'round', 'round already over');
  const late = await colors();
  assert(late.includes(accent) && late.length > 1, `no accent flash in last 1.5s: ${late}`);
});

await check("fix3: a rule's first-ever round (Mirror, Odd/even) waits like the tutorial; later rounds don't", async () => {
  await fresh({ launched: '1', seenRules: '["count"]' });
  await page.tap('#play');
  await page.waitForTimeout(400);
  assert((await g('clockOn')) === true, 'round 1 (count, seen) waited');
  for (let r = 1; r <= 12; r++) {
    if (r === 4 || r === 10) {
      assert((await g('rule')) === (r === 4 ? 'symmetry' : 'parity'), `round ${r} rule ${await g('rule')}`);
      await page.waitForTimeout(800);
      assert((await g('clockOn')) === false, `round ${r} debut: clock started before tap / 1.5s`);
      await page.waitForTimeout(900);
      assert((await g('clockOn')) === true, `round ${r} debut: clock not started by 1.7s`);
    } else if (r === 5 || r === 11) {
      await page.waitForTimeout(400);
      assert((await g('clockOn')) === true, `round ${r} waited`);
    }
    await tapOdd();
  }
});

await check('fix6: clock never runs while taps are locked', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await fresh(SEEN_ALL, { reducedMotion });
    await page.tap('#play');
    const t = await page.evaluate(async () => {
      const G = window.__game, q = (i) => document.querySelector(`#grid button[data-i="${i}"]`), res = [];
      for (let k = 0; k < 3; k++) {
        while (!G.ready) await new Promise((r) => setTimeout(r, 5));
        q(G.breakerIndex).click();
        let lockedWithClock = false;
        while (!G.ready) { if (G.clockOn) lockedWithClock = true; await new Promise((r) => setTimeout(r, 2)); }
        res.push(lockedWithClock);
      }
      return res;
    });
    assert(t.every((x) => !x), `${reducedMotion}: clock ran during tap lock ${JSON.stringify(t)}`);
  }
});

await check("'?' panel: one divider above the hints", async () => {
  await fresh(SEEN_ALL);
  await page.tap('#how');
  assert((await page.locator('#help').evaluate((e) => getComputedStyle(e).borderTopStyle)) === 'none', 'help has its own top border under the rule');
});

await check('contrast: every visible text >= 4.5:1 (>= 3:1 if large) on every screen', async () => {
  await fresh({ best: '3' });
  const audit = () => page.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor);
      if (c.length === 3 || c[3] > 0) return c; } return [255, 255, 255]; };
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[aria-hidden="true"]') || !el.checkVisibility?.() || !el.getClientRects().length) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el), px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
      const a = lum(rgb(cs.color)), b = lum(bgOf(el)), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < (large ? 3 : 4.5)) bad.push(`${el.id || el.className || el.tagName} "${el.textContent.trim().slice(0, 12)}" ${ratio.toFixed(2)}`);
    }
    return bad;
  });
  let bad = await audit();
  await page.tap('#how'); bad = bad.concat(await audit());
  await page.tap('#how'); await page.tap('#play'); await ready(); bad = bad.concat(await audit());
  await tile((await g('breakerIndex')) === 0 ? 1 : 0).tap(); await waitState('over'); bad = bad.concat(await audit());
  assert(bad.length === 0, bad.join('; '));
});

await check('screenshots: start, round with hint, 25-tile round, game over', async () => {
  page = await newPage();
  await page.goto(url);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'shots/polish-start.png') });
  await page.tap('#play');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'shots/polish-hint.png') });
  for (let r = 1; r < 19; r++) await tapOdd();
  await ready(); await page.waitForTimeout(300);
  assert((await page.locator('#grid button').count()) === 25, 'round 19 not 25 tiles');
  await page.screenshot({ path: path.join(dir, 'shots/polish-25.png') });
  await tile((await g('breakerIndex')) === 0 ? 1 : 0).tap();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'shots/polish-reveal.png') });
  await waitState('over'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'shots/polish-over.png') });
});

await check('no console errors', async () => assert(errors.length === 0, errors.join(' | ')));

await browser.close();
server.close();
console.log(fails ? `FAIL (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
