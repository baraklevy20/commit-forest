// Draw the forest with the add-on's own engine in headless Chrome, frame by frame. The
// page's clock is ours: animation frames and timers wait until pump() runs them at a time
// we choose, so every frame is the same length however slow the machine is.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { PANEL_PX, sceneData } from './scenery.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// the clock starts here (ms), past the moment a scene first draws, so nothing is mid-appearance
// (a loop wraps its clock, so where in the loop the recording starts doesn't matter)
const START_MS = 20000;
// a scene with birds loops in no less than this: they cross it in about a minute at the
// add-on's own pace, and a shorter loop would make them fly a whole crossing faster
const BIRD_LOOP = 60;
const CHROMES = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const engine = () => readFileSync(path.join(ROOT, 'engine', 'forest-engine.txt'), 'utf8');

function findChrome(given) {
  const found = [given, process.env.CHROME, ...CHROMES].find(p => p && existsSync(p));
  if (!found) throw new Error('could not find Chrome. Commit Forest runs on runs-on: ubuntu-latest, which has it; on another runner, install Chrome and pass its path as the chrome input');
  return found;
}

function page(forest, mood, loop) {
  const data = sceneData(forest, mood, loop);
  return `<!doctype html><meta charset=utf-8><style>body{margin:0}.af-panel{width:${PANEL_PX}px;margin:0;padding:0}</style>
<script>let NOW_MS = 0, TID = 0; const Q = [], T = [];
window.requestAnimationFrame = cb => { Q.push(cb); return Q.length; };
window.cancelAnimationFrame = () => {};
window.setTimeout = (cb, ms) => { T.push({ id: ++TID, at: NOW_MS + (+ms || 0), cb }); return TID; };
window.clearTimeout = id => { const i = T.findIndex(t => t.id === id); if (i >= 0) T.splice(i, 1); };
window.requestIdleCallback = cb => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
performance.now = () => NOW_MS; window.ERRS = [];
window.onerror = (m, f, l, c, e) => { window.ERRS.push(String((e && e.stack) || m)); };
function pump(ms) { NOW_MS = ms;
  for (let due; (due = T.filter(t => t.at <= ms)).length;) due.forEach(t => { T.splice(T.indexOf(t), 1); t.cb(); });
  const run = Q.splice(0); run.forEach(cb => cb(ms)); }</script>
<div class="af-panel" id="p"></div>
<script>${engine()}</script>
<script>window.D = ${JSON.stringify(data)};
NOW_MS = ${START_MS};
try { AnkiForest.mount(document.getElementById('p'), window.D, { now: true }); }
catch (e) { window.ERRS.push('mount: ' + (e.stack || e)); }</script>`;
}

/* `seconds` of the scene as PNG data URLs of the canvas (388 x 194), `fps` a second, with
 * every motion repeating in `loop` seconds: when the two are the same, the frame after the
 * last is the first again. A scene that turns out to have birds loops in BIRD_LOOP seconds
 * at least, and with `whole` (recording one whole loop) the recording grows to match. */
export async function renderFrames(forest, mood, { chrome, seconds = 4, fps = 12, loop = seconds, whole = false } = {}) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(chrome), headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: PANEL_PX + 40, height: 600 });
    await tab.setContent(page(forest, mood, loop), { waitUntil: 'load' });
    // the engine decides on birds from the time of day, the weather and today's numbers
    const birds = await tab.evaluate(() => document.getElementById('p').afEnv?.theme?.birds || 0);
    if (birds && loop < BIRD_LOOP) {
      if (whole) seconds = BIRD_LOOP;
      loop = BIRD_LOOP;
      // the loop helpers read it as they draw, so it can change after the scene is set up
      await tab.evaluate(l => { window.AnkiForest.LOOP = l; }, loop);
    }
    const result = await tab.evaluate((frames, step, start) => {
      const c = document.querySelector('canvas'), shots = [];
      if (!c) return { errors: window.ERRS.concat('no canvas was drawn'), shots };
      for (let i = 0; i < frames; i++) { pump(start + i * step); shots.push(c.toDataURL('image/png')); }
      return { errors: window.ERRS, w: c.width, h: c.height, shots };
    }, Math.max(1, Math.round(seconds * fps)), 1000 / fps, START_MS);
    if (result.errors.length) throw new Error('the engine failed: ' + result.errors[0]);
    return { ...result, loop };
  } finally {
    await browser.close();
  }
}
