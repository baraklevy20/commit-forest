// Grow a forest on this machine, without pushing anything:
//
//   node scripts/local.js --user baraklevy20 [--scenery golden_lake] [--dark aurora]
//                         [--period last-year|this-year|all|2025] [--format apng|gif|png] [--out out]
//                         [--timezone Europe/Berlin] [--no-stats]
//
// The calendar is read with GITHUB_TOKEN, or the gh CLI's token when that isn't set.

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { grow } from '../src/grow.js';

const { values: a } = parseArgs({
  options: {
    user: { type: 'string' }, scenery: { type: 'string', default: 'golden_lake' }, dark: { type: 'string', default: 'aurora' },
    period: { type: 'string', default: 'last-year' }, format: { type: 'string', default: 'apng' }, out: { type: 'string', default: 'out' },
    chrome: { type: 'string' }, timezone: { type: 'string' }, 'no-stats': { type: 'boolean' },
  },
});
if (!a.user) { console.error('pass --user <github login>'); process.exit(2); }
const token = process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();

const started = Date.now();
const { forest, files, alt } = await grow({
  login: a.user, token, scenery: a.scenery, darkScenery: a.dark, period: a.period, format: a.format, chrome: a.chrome, outDir: a.out,
  stats: !a['no-stats'], timezone: a.timezone,
});
const s = forest.stats;
console.log(`${s.trees} trees (${forest.merged ? forest.merged.count + ' in the deep forest, ' : ''}${s.ponds} ponds, `
  + `${forest.visitors.map(v => v.key).join(', ') || 'no animals'}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(files.join('\n'));
console.log(`alt: ${alt}`);
