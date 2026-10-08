// From a username to image files: the calendar, the forest, the frames, the encoding.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchCalendar } from './calendar.js';
import { buildForest, inPeriod } from './forest.js';
import { renderFrames } from './render.js';
import { CHOICES, checkScenery, dailyScenery, moodOf, SCENERIES, sceneryList, tidy, timeAt } from './scenery.js';
import { labelLine, periodLabel, statsLine } from './stamp.js';
import * as encode from './encode.js';

// each format: its file extension, and how a list of frames becomes that file
const FORMATS = {
  apng: { ext: 'png', write: (frames, fps) => encode.apng(frames, fps) },
  gif: { ext: 'gif', write: (frames, fps) => encode.gif(frames, fps) },
  png: { ext: 'png', write: frames => encode.png(frames) },
};
// shuffle: each scenery shows for this long, then dissolves into the next over DISSOLVE_FRAMES
const SHUFFLE_SECONDS = 5, SHUFFLE_FPS = 12, DISSOLVE_FRAMES = 6;

export function altText(stats, period, year) {
  const span = period === 'all' ? '' : period === 'last-year' ? ' in the last year' : ` in ${periodLabel(period, year)}`;
  const trees = `${stats.trees.toLocaleString('en-US')} ${stats.trees === 1 ? 'tree' : 'trees'}`;
  return `My contribution forest: ${trees}, one for each day I contributed${span}`;
}

/* The hour now on a clock in an IANA time zone ('Asia/Jerusalem'). */
export function hourIn(timezone, now = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  } catch {
    throw new Error(`"${timezone}" is not a time zone; use a name such as Europe/Berlin or America/New_York`);
  }
}

export async function grow({ login, token, scenery = 'golden_lake', darkScenery, sceneries, gallery, period = 'last-year',
  format = 'apng', stats = true, label = true, timezone, chrome, outDir }) {
  scenery = tidy(scenery); darkScenery = tidy(darkScenery);
  // every choice is checked before anything is drawn, so a mistake costs no rendering
  const out = FORMATS[format];
  if (!out) throw new Error(`format must be apng, gif or png, not "${format}"`);
  for (const choice of [scenery, darkScenery]) if (choice) checkScenery(choice, CHOICES);
  const pool = sceneryList(sceneries), shown = gallery ? sceneryList(gallery) : [];
  // the light image follows the user's clock when they give a time zone; the dark one stays as it is
  const lightTime = timezone ? timeAt(hourIn(timezone)) : null;

  const { days, today } = await fetchCalendar(login, token, period);
  const forest = buildForest(inPeriod(days, period, today), { login, today });
  const year = today.slice(0, 4);
  const since = forest.stats.oldest_date && forest.stats.oldest_date.slice(0, 4);
  const lines = [
    ...(label ? [{ text: labelLine(login), top: true }] : []),
    ...(stats ? [{ text: statsLine(forest.stats, period, year, since), top: false }] : []),
  ];
  const still = format === 'png';

  // `seconds` of one scenery, moving as it does in a loop of `loop` seconds
  const frames = async (key, time, { seconds, loop, fps, whole = false }) => {
    const { shots } = await renderFrames(forest, moodOf(key, today, time), { chrome, seconds: still ? 1 / fps : seconds, fps, loop, whole: whole && !still });
    return encode.prepare(shots, lines);
  };
  // one scenery, a whole loop of it, at its own length and frame rate (src/presets.json)
  const scene = async (key, time) => {
    const { loop, fps } = SCENERIES[key];
    return { frames: await frames(key, time, { seconds: loop, loop, fps, whole: true }), fps };
  };
  // every scenery in `keys` in turn, each dissolving into the next, the last back into the first
  const shuffle = async (keys, time) => {
    if (still) return scene(keys[0], time);
    const parts = [];
    for (const key of keys) {
      const { loop } = SCENERIES[key];
      parts.push(await frames(key, time, { seconds: Math.min(loop, SHUFFLE_SECONDS), loop, fps: SHUFFLE_FPS }));
    }
    const all = parts.flatMap((p, i) => [...p, ...encode.dissolve(p[p.length - 1], parts[(i + 1) % parts.length][0], DISSOLVE_FRAMES)]);
    return { frames: all, fps: SHUFFLE_FPS };
  };
  // what a scenery input asks for: a key, 'daily' or 'shuffle'
  const draw = (choice, time, role) => choice === 'shuffle' ? shuffle(pool, time)
    : scene(choice === 'daily' ? dailyScenery(pool, login, today, role) : choice, time);

  const wanted = [['forest', scenery, lightTime, 'light'], ['forest-dark', darkScenery, null, 'dark'],
    ...shown.map(k => [`forest-${k}`, k, null, 'light'])];
  mkdirSync(outDir, { recursive: true });
  const files = {};  // by name: forest, forest-dark, forest-<scenery>
  for (const [name, choice, time, role] of wanted) {
    if (!choice) continue;
    const { frames: f, fps } = await draw(choice, time, role);
    files[name] = path.join(outDir, `${name}.${out.ext}`);
    writeFileSync(files[name], out.write(f, fps));
  }
  return { forest, files, alt: altText(forest.stats, period, year), today };
}
