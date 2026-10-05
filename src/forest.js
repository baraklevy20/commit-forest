// Contribution days -> the forest the engine draws: one tree per day with a contribution.
// The rules mirror the add-on's forest_data.py, with GitHub's numbers in place of reviews.

import { createHash } from 'node:crypto';

// a tree's stage, by its age in days (the add-on's stages, with age standing in for memory)
export const SEEDLING = 0, SAPLING = 1, YOUNG = 2, MATURE = 3, OLD = 4, ANCIENT = 5;
const SAPLING_DAYS = 3, MATURE_DAYS = 21, OLD_DAYS = 180, ANCIENT_DAYS = 365;
// this many days without a contribution leave a pond (the add-on uses 7, which would turn
// a weekend coder's forest into a lake district)
export const BREAK_DAYS = 14;
// drawn one by one; older trees become the deep forest at the back
export const MAX_INDIVIDUAL_TREES = 730;
// about a third of the trees are conifers, and about one in five crowns is small, both by
// each day's seed; a crown is large on the user's busiest days (GitHub's darkest square)
const PINE_PERCENT = 34, SMALL_PERCENT = 20;
const BUSIEST = 'FOURTH_QUARTILE';

// the animals: for trees and time, never for a streak
const VISITORS = [
  ['rabbit', 'a rabbit', 'your forest reached 50 trees', s => s.trees >= 50],
  ['deer', 'a deer', 'your forest reached 100 trees', s => s.trees >= 100],
  ['owl', 'an owl', 'your first tree became ancient', s => s.ancient >= 1],
  ['heron', 'a heron', 'a pond formed where you took a break', s => s.ponds >= 1],
  ['cabin', 'a cabin', 'your forest turned one year old', s => s.forest_age >= ANCIENT_DAYS],
];

const DAY_MS = 86400000;
const dayNumber = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY_MS);
const isoOf = n => new Date(n * DAY_MS).toISOString().slice(0, 10);

export function seedOf(text) {
  return createHash('sha1').update(text).digest().readUInt32BE(0) & 0x7fffffff;
}

function stageOf(ago) {
  if (ago <= 0) return SEEDLING;
  if (ago < SAPLING_DAYS) return SAPLING;
  if (ago < MATURE_DAYS) return YOUNG;
  if (ago < OLD_DAYS) return MATURE;
  if (ago < ANCIENT_DAYS) return OLD;
  return ANCIENT;
}

/* The days a period covers, from a calendar that may hold more: 'this-year' (the calendar
 * year of today), a year ('2025'), or 'last-year' and 'all', which keep every day given
 * (the calendar fetched for them is already that span). */
export function inPeriod(days, period, today) {
  if (period === 'all' || period === 'last-year') return days;
  if (!period || period === 'this-year') return days.filter(d => d.date.startsWith(today.slice(0, 4) + '-'));
  if (/^\d{4}$/.test(period)) return days.filter(d => d.date.startsWith(period + '-'));
  throw new Error(`period must be last-year, this-year, all or a year like 2025, not "${period}"`);
}

/* days: [{ date: 'YYYY-MM-DD', count, level }] from the calendar, any order; today: 'YYYY-MM-DD'.
 * The layout is seeded from the user's login, so a tree never moves from one day to the next. */
export function buildForest(days, { login, today, cap = MAX_INDIVIDUAL_TREES }) {
  const todayN = dayNumber(today);
  const active = days.filter(d => d.count > 0).sort((a, b) => a.date.localeCompare(b.date));
  const trees = active.map(d => {
    const day = dayNumber(d.date), ago = todayN - day;
    const seed = seedOf(`${login.toLowerCase()}:${d.date}`);
    const size = d.level === BUSIEST ? 2 : (seed >>> 8) % 100 < SMALL_PERCENT ? 0 : 1;
    return {
      day, ago, date: d.date, n: d.count, stage: stageOf(ago), size, health: 0,
      kind: seed % 100 < PINE_PERCENT ? 1 : 0, seed,
      remembered: 1, strength: ago, struggling: 0, measured: false,
    };
  });
  markPonds(trees, active.map(d => dayNumber(d.date)));
  const stats = statsOf(trees, todayN);
  const visitors = VISITORS.filter(([, , , test]) => test(stats))
    .map(([key, label, why]) => ({ key, label, why, new: false }));
  return mergeOld({ trees, stats, visitors, forest_seed: seedOf(login.toLowerCase()) }, cap);
}

/* Mark each break of BREAK_DAYS or more on the first tree planted after it, as the add-on's
 * _ponds does. Breaks with at most one tree between them were one spell away: one pond, as
 * long as the days away together. A break still running (no tree after it) leaves none. */
function markPonds(trees, activeDays) {
  const ponds = [];  // [index of the tree after it, days away, first day away, last day away]
  for (let i = 1; i < activeDays.length; i++) {
    const gap = activeDays[i] - activeDays[i - 1] - 1;
    if (gap < BREAK_DAYS) continue;
    const last = ponds[ponds.length - 1];
    if (last && i <= last[0] + 1) { last[1] += gap; last[3] = activeDays[i] - 1; }
    else ponds.push([i, gap, activeDays[i - 1] + 1, activeDays[i] - 1]);
  }
  for (const [i, gap, from, to] of ponds) Object.assign(trees[i], { gap, gap_from: isoOf(from), gap_to: isoOf(to) });
}

function statsOf(trees, todayN) {
  const count = stage => trees.filter(t => t.stage === stage).length;
  const last = trees[trees.length - 1];
  return {
    trees: trees.length,
    cards: trees.reduce((a, t) => a + t.n, 0),
    ancient: count(ANCIENT), old: count(OLD), young: count(YOUNG),
    yellowing: 0,
    // no streaks: nothing in the picture may depend on an unbroken run
    streak: 0, longest_streak: 0,
    reviews: trees.reduce((a, t) => a + t.n, 0),
    today_reviews: 0,
    forest_age: trees.length ? todayN - trees[0].day : 0,
    oldest_date: trees.length ? trees[0].date : null,
    planted_today: Boolean(last && last.ago === 0),
    today_cards: last && last.ago === 0 ? last.n : 0,
    ponds: trees.filter(t => t.gap).length,
    mature_cards: 0,
  };
}

/* Fold everything older than the newest `cap` trees into the deep forest's summary. */
export function mergeOld(forest, cap = MAX_INDIVIDUAL_TREES) {
  const { trees } = forest;
  if (trees.length <= cap) return forest;
  const old = trees.slice(0, trees.length - cap), kept = trees.slice(trees.length - cap);
  const merged = {
    count: old.length,
    cards: old.reduce((a, t) => a + t.n, 0),
    ancient: old.filter(t => t.stage === ANCIENT).length,
    ponds: old.filter(t => t.gap).length,
    from_date: old[0].date, to_date: old[old.length - 1].date,
    from_ago: old[0].ago, to_ago: old[old.length - 1].ago,
  };
  return { ...forest, trees: kept, merged };
}
