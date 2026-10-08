// The sceneries and how a forest is handed to the engine: shared by the Action (render.js,
// grow.js) and the preview page (site/), so the page draws exactly what the Action would.

import SCENERIES from './presets.json' with { type: 'json' };
import { seedOf } from './forest.js';

export { SCENERIES };
// the panel is this wide in CSS pixels; the engine draws a canvas of half that (one canvas
// pixel per 2 x 2 block) at 2:1, so 388 x 194, which the encoder doubles back to 776 x 388
export const PANEL_PX = 776;
export const CHOICES = ['daily', 'shuffle'];

// scenery names as people may write them: Golden-Lake is golden_lake
export const tidy = name => name && name.trim().toLowerCase().replace(/-/g, '_');

export function checkScenery(key, also = []) {
  if (!SCENERIES[key] && !also.includes(key)) {
    throw new Error(`there is no scenery called "${key}"; choose from ${[...Object.keys(SCENERIES), ...also].join(', ')}`);
  }
  return key;
}

/* A list of scenery keys from an input: 'all' (or nothing) for every one, or names separated by commas. */
export function sceneryList(text) {
  if (!text || text.trim() === 'all') return Object.keys(SCENERIES);
  return text.split(',').map(tidy).filter(Boolean).map(k => checkScenery(k));
}

/* Today's scenery for 'daily': a different one each day, the same all day, picked from `list`
 * by the date and the user, so two profiles don't change in step, and separately for the
 * light and the dark image (`role`). */
export function dailyScenery(list, login, today, role = 'light') {
  return list[seedOf(`${login.toLowerCase()}:daily:${role}:${today}`) % list.length];
}

/* The time of day for an hour on the user's clock (0-23). */
export function timeAt(hour) {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 16) return 'day';
  if (hour >= 16 && hour < 18) return 'golden_hour';
  if (hour >= 18 && hour < 20) return 'dusk';
  return 'night';
}

/* The moon's phase on a date, 0 new to 0.5 full to 1 new again. */
function moonPhase(date) {
  const synodic = 29.530588853, knownNew = Date.UTC(2000, 0, 6, 18, 14);
  return ((((Date.parse(date + 'T12:00:00Z') - knownNew) / 86400000) % synodic) + synodic) % synodic / synodic;
}

/* The scene's look settings; `time` replaces the scenery's own time of day. */
export function moodOf(scenery, date, time) {
  const look = SCENERIES[scenery];
  return {
    time: time || look.time, clock: false, weather: look.weather, special: look.environment, wind: false,
    environment: look.environment, landscape: look.landscape, landmark: look.landmark,
    moon: Math.round(moonPhase(date) * 1000) / 1000, source: 'manual',
  };
}

/* What the engine's mount() takes: the forest, the look, and the loop length in seconds
 * (null for a forest that simply runs, as on the preview page). */
export function sceneData(forest, mood, loop = null) {
  return {
    trees: forest.trees, stats: forest.stats, visitors: forest.visitors, merged: forest.merged || null,
    forestSeed: forest.forest_seed, dayNumber: forest.day_number, anniversaries: [], events: [], journal: '', mood,
    environmentName: '', animations: true, tooltips: false, maxWidth: PANEL_PX,
    // the engine's loop mode: every motion repeats exactly in this many seconds
    loop,
  };
}
