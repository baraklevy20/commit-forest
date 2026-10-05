// From a username to image files: the calendar, the forest, the frames, the encoding.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchCalendar } from './calendar.js';
import { buildForest, inPeriod } from './forest.js';
import { moodOf, renderFrames, SCALE, SCENERIES, timeAt } from './render.js';
import { statsLine } from './stamp.js';
import * as encode from './encode.js';

export const FORMATS = { apng: 'png', png: 'png', gif: 'gif' };

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

export async function grow({ login, token, scenery, darkScenery, period = 'last-year', format = 'apng', stats = true,
  timezone, chrome, outDir, days }) {
  if (!FORMATS[format]) throw new Error(`format must be apng, gif or png, not "${format}"`);
  const fetched = days ? { days, today: days[days.length - 1].date } : await fetchCalendar(login, token, period);
  const today = fetched.today;
  const forest = buildForest(inPeriod(fetched.days, period, today), { login, today });
  const year = today.slice(0, 4);
  const text = stats ? statsLine(forest.stats, period, year) : null;
  // the light image follows the user's clock when they give a time zone; the dark one stays as it is
  const lightTime = timezone ? timeAt(hourIn(timezone)) : null;
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const [name, key, time] of [['forest', scenery, lightTime], ['forest-dark', darkScenery, null]]) {
    if (!key) continue;
    // each scenery loops in its own time (src/presets.json, set in scripts/sync_engine.py)
    const still = format === 'png', mood = moodOf(key, today, time), { loop, fps } = SCENERIES[key];
    const shots = (await renderFrames(forest, mood, { chrome, seconds: still ? 1 / fps : loop, fps })).shots;
    const bytes = format === 'gif' ? encode.gif(shots, fps, SCALE, text)
      : still ? encode.png(shots, SCALE, text) : encode.apng(shots, fps, SCALE, text);
    const file = path.join(outDir, `${name}.${FORMATS[format]}`);
    writeFileSync(file, bytes);
    files.push(file);
  }
  return { forest, files, alt: altText(forest.stats, period, year), today };
}
