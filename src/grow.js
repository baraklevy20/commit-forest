// From a username to image files: the calendar, the forest, the frames, the encoding.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchCalendar } from './calendar.js';
import { buildForest, inPeriod, seedOf } from './forest.js';
import { moodOf, renderFrames, SCALE, SCENERIES, timeAt } from './render.js';
import { statsLine } from './stamp.js';
import * as encode from './encode.js';

export const FORMATS = { apng: 'png', png: 'png', gif: 'gif' };
// shuffle: each scenery shows for this long, then dissolves into the next over DISSOLVE_FRAMES
const SHUFFLE_SECONDS = 5, SHUFFLE_FPS = 12, DISSOLVE_FRAMES = 6;

export function altText(stats, period, year) {
  const span = period === 'all' ? '' : period === 'last-year' ? ' in the last year' : ` in ${period === 'this-year' ? year : period}`;
  const trees = `${stats.trees.toLocaleString('en-US')} ${stats.trees === 1 ? 'tree' : 'trees'}`;
  return `My contribution forest: ${trees}, one for each day I contributed${span}`;
}

/* The hour now on a clock in an IANA time zone ('Asia/Jerusalem'). */
export function hourIn(timezone, now = new Date()) {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(h);
}

/* A list of scenery keys from an input: 'all' (or nothing) for every one, or names separated by commas. */
export function sceneryList(text) {
  if (!text || text.trim() === 'all') return Object.keys(SCENERIES);
  const keys = text.split(',').map(s => s.trim()).filter(Boolean);
  const unknown = keys.filter(k => !SCENERIES[k]);
  if (unknown.length) throw new Error(`no scenery called ${unknown.join(', ')}; there are: ${Object.keys(SCENERIES).join(', ')}`);
  return keys;
}

/* Today's scenery for 'daily': a different one each day, the same all day, picked from `list`
 * by the date and the user, so two profiles don't change in step. */
export function dailyScenery(list, login, today) {
  return list[seedOf(`${login.toLowerCase()}:daily:${today}`) % list.length];
}

export async function grow({ login, token, scenery = 'golden_lake', darkScenery, sceneries, gallery, period = 'last-year',
  format = 'apng', stats = true, timezone, chrome, outDir, days }) {
  if (!FORMATS[format]) throw new Error(`format must be apng, gif or png, not "${format}"`);
  const fetched = days ? { days, today: days[days.length - 1].date } : await fetchCalendar(login, token, period);
  const today = fetched.today;
  const forest = buildForest(inPeriod(fetched.days, period, today), { login, today });
  const year = today.slice(0, 4);
  const text = stats ? statsLine(forest.stats, period, year) : null;
  const pool = sceneryList(sceneries);
  // the light image follows the user's clock when they give a time zone; the dark one stays as it is
  const lightTime = timezone ? timeAt(hourIn(timezone)) : null;
  const still = format === 'png';

  // one scenery's frames, at its own loop length and frame rate (src/presets.json)
  const scene = async (key, time) => {
    const { loop, fps } = SCENERIES[key];
    const shots = (await renderFrames(forest, moodOf(key, today, time), { chrome, seconds: still ? 1 / fps : loop, fps, loop })).shots;
    return { frames: encode.prepare(shots, text), fps };
  };
  // every scenery in `keys` in turn, each dissolving into the next, the last back into the first
  const shuffle = async (keys, time) => {
    const parts = [];
    for (const key of keys) {
      const { loop } = SCENERIES[key], seconds = still ? 1 / SHUFFLE_FPS : Math.min(loop, SHUFFLE_SECONDS);
      const shots = (await renderFrames(forest, moodOf(key, today, time), { chrome, seconds, fps: SHUFFLE_FPS, loop })).shots;
      parts.push(encode.prepare(shots, text));
    }
    if (still) return { frames: parts[0], fps: SHUFFLE_FPS };
    const frames = parts.flatMap((p, i) => [...p, ...encode.dissolve(p[p.length - 1], parts[(i + 1) % parts.length][0], DISSOLVE_FRAMES)]);
    return { frames, fps: SHUFFLE_FPS };
  };
  // what a scenery input asks for: a key, 'daily' or 'shuffle'
  const draw = (choice, time) => {
    if (choice === 'shuffle') return shuffle(pool, time);
    const key = choice === 'daily' ? dailyScenery(pool, login, today) : choice;
    if (!SCENERIES[key]) throw new Error(`no scenery called ${key}; there are: ${Object.keys(SCENERIES).join(', ')}, daily, shuffle`);
    return scene(key, time);
  };

  const wanted = [['forest', scenery, lightTime], ['forest-dark', darkScenery, null]];
  if (gallery) for (const key of sceneryList(gallery)) wanted.push([`forest-${key}`, key, null]);
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const [name, choice, time] of wanted) {
    if (!choice) continue;
    const { frames, fps } = await draw(choice, time);
    const bytes = format === 'gif' ? encode.gif(frames, fps, SCALE) : still ? encode.png(frames, SCALE) : encode.apng(frames, fps, SCALE);
    const file = path.join(outDir, `${name}.${FORMATS[format]}`);
    writeFileSync(file, bytes);
    files.push(file);
  }
  return { forest, files, alt: altText(forest.stats, period, year), today };
}
