import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForest, inPeriod, ANCIENT, SEEDLING, MATURE } from '../src/forest.js';

const day = (date, count = 1, level = 'FIRST_QUARTILE') => ({ date, count, level });
const opts = { login: 'someone', today: '2026-10-05' };

test('one tree per day with a contribution, none for empty days', () => {
  const f = buildForest([day('2026-10-01', 3), day('2026-10-02', 0, 'NONE'), day('2026-10-03', 40)], opts);
  assert.equal(f.trees.length, 2);
  assert.equal(f.stats.cards, 43);
});

test('a new account has no trees and no special case', () => {
  const f = buildForest([day('2026-10-05', 0, 'NONE')], opts);
  assert.equal(f.trees.length, 0);
  assert.deepEqual(f.visitors, []);
});

test('crowns follow the darkest square, never the commit count', () => {
  const many = buildForest([day('2026-09-01', 300, 'SECOND_QUARTILE')], opts).trees[0];
  const busiest = buildForest([day('2026-09-01', 2, 'FOURTH_QUARTILE')], opts).trees[0];
  assert.notEqual(many.size, 2);
  assert.equal(busiest.size, 2);
});

test('trees grow with age', () => {
  const f = buildForest([day('2024-01-01'), day('2026-06-01'), day('2026-10-05')], opts);
  assert.deepEqual(f.trees.map(t => t.stage), [ANCIENT, MATURE, SEEDLING]);
});

test('a break of 14 days leaves a pond, 13 days does not', () => {
  const f = buildForest([day('2026-01-01'), day('2026-01-16'), day('2026-01-30')], opts);
  assert.equal(f.trees[1].gap, 14);
  assert.equal(f.trees[2].gap, undefined);
  assert.equal(f.stats.ponds, 1);
});

test('the layout depends on the login, and stays put from one day to the next', () => {
  const days = [day('2026-09-01'), day('2026-09-02')];
  const a = buildForest(days, opts), b = buildForest(days, { ...opts, today: '2026-10-06' });
  assert.deepEqual(a.trees.map(t => t.seed), b.trees.map(t => t.seed));
  assert.notDeepEqual(a.trees.map(t => t.seed), buildForest(days, { ...opts, login: 'other' }).trees.map(t => t.seed));
});

test('no animal comes from a streak', () => {
  const days = Array.from({ length: 120 }, (_, i) => day(new Date(Date.UTC(2026, 5, 1) + i * 86400000).toISOString().slice(0, 10)));
  const f = buildForest(days, opts);
  assert.equal(f.stats.streak, 0);
  assert.deepEqual(f.visitors.map(v => v.key).sort(), ['deer', 'rabbit']);
});

test('more than 730 trees: the oldest go to the deep forest', () => {
  const days = Array.from({ length: 1000 }, (_, i) => day(new Date(Date.UTC(2023, 0, 1) + i * 86400000).toISOString().slice(0, 10)));
  const f = buildForest(days, opts);
  assert.equal(f.trees.length, 730);
  assert.equal(f.merged.count, 270);
});

test('periods: the fetched span as it is, this year, one calendar year', () => {
  const days = [day('2024-05-01'), day('2025-03-01'), day('2025-11-01'), day('2026-10-05')];
  assert.equal(inPeriod(days, 'all', '2026-10-05').length, 4);
  // last-year is fetched as the profile's own calendar, so every day of it is kept
  assert.equal(inPeriod(days, 'last-year', '2026-10-05').length, 4);
  assert.equal(inPeriod(days, 'this-year', '2026-10-05').length, 1);
  assert.equal(inPeriod(days, '2025', '2026-10-05').length, 2);
  assert.throws(() => inPeriod(days, 'forever', '2026-10-05'));
});

test('birds: one for each contribution in the past day', () => {
  const f = buildForest([day('2026-10-01', 9), day('2026-10-04', 2), day('2026-10-05', 1)], opts);
  assert.equal(f.stats.today_reviews, 3 * 40);
});
