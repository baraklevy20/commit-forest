// Draw the forest with the add-on's own engine in headless Chrome, frame by frame. The
// page's clock is ours: animation frames and timers wait until pump() runs them at a time
// we choose, so every frame is the same length however slow the machine is.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// the panel is this wide in CSS pixels; the engine draws a canvas of half that (one canvas
// pixel per 2 x 2 block) at 2:1, so 388 x 194, which the encoder doubles back to 776 x 388
export const PANEL_PX = 776, SCALE = 2;
// the clock starts here (ms), past the moment a scene first draws, so nothing is mid-appearance;
// a whole number of loops, so the recording starts at the loop's beginning
const START_MS = 20000;
// a scene with birds loops in no less than this: they cross it in about a minute at the
// add-on's own pace, and a shorter loop would make them fly a whole crossing faster
export const BIRD_LOOP = 60;
const CHROMES = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export const SCENERIES = JSON.parse(readFileSync(path.join(ROOT, 'src', 'presets.json'), 'utf8'));
const engine = () => readFileSync(path.join(ROOT, 'engine', 'forest-engine.txt'), 'utf8');

export function findChrome(given) {
  const found = [given, process.env.CHROME, ...CHROMES].find(p => p && existsSync(p));
  if (!found) throw new Error('could not find Chrome; pass its path as the chrome input');
  return found;
}

/* The moon's phase on a date, 0 new to 0.5 full to 1 new again. */
function moonPhase(date) {
  const synodic = 29.530588853, knownNew = Date.UTC(2000, 0, 6, 18, 14);
  return ((((Date.parse(date + 'T12:00:00Z') - knownNew) / 86400000) % synodic) + synodic) % synodic / synodic;
}

/* The time of day for an hour on the user's clock (0-23). */
export function timeAt(hour) {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 16) return 'day';
  if (hour >= 16 && hour < 18) return 'golden_hour';
  if (hour >= 18 && hour < 20) return 'dusk';
  return 'night';
}

/* The scene's look settings; `time` replaces the scenery's own time of day. */
export function moodOf(scenery, date, time) {
  const look = SCENERIES[scenery];
  if (!look) throw new Error(`no scenery called ${scenery}; there are: ${Object.keys(SCENERIES).join(', ')}`);
  return {
    time: time || look.time, clock: false, weather: look.weather, special: look.environment, wind: false,
    environment: look.environment, landscape: look.landscape, landmark: look.landmark,
    moon: Math.round(moonPhase(date) * 1000) / 1000, source: 'manual',
  };
}

function page(forest, mood, loop) {
  const data = {
    trees: forest.trees, stats: forest.stats, visitors: forest.visitors, merged: forest.merged || null,
    forestSeed: forest.forest_seed, anniversaries: [], events: [], journal: '', mood,
    environmentName: '', animations: true, tooltips: false, maxWidth: PANEL_PX,
    // the engine's loop mode: every motion repeats exactly in this many seconds
    loop,
  };
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
 * at least, and a whole loop is then recorded as that much longer. */
export async function renderFrames(forest, mood, { chrome, seconds = 4, fps = 12, loop = seconds } = {}) {
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
      if (seconds === loop) seconds = BIRD_LOOP;
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
