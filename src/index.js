// The Action. It never fails the run: a failing scheduled workflow is switched off by
// GitHub after 60 days, so on any error it leaves yesterday's images where they are,
// says why in the run summary, and finishes green.

import { appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { grow } from './grow.js';
import { publish } from './publish.js';

const input = name => (process.env[`INPUT_${name.toUpperCase()}`] || '').trim();

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  console.log(markdown);
}

function snippet({ repo, branch, files, alt }) {
  const url = f => `https://raw.githubusercontent.com/${repo}/${branch}/${path.basename(f)}`;
  const [light, dark] = files;
  const img = `<img alt="${alt}" src="${url(light)}">`;
  const inner = dark
    ? `<picture>\n    <source media="(prefers-color-scheme: dark)" srcset="${url(dark)}">\n    ${img}\n  </picture>`
    : img;
  return `<a href="https://github.com/baraklevy20/commit-forest">\n  ${inner}\n</a>`;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || 'you/you', token = input('token'), branch = input('branch') || 'output';
  const period = input('period') || 'this-year';
  try {
    const { forest, files, alt } = await grow({
      login: input('user') || repo.split('/')[0], token,
      scenery: input('scenery') || 'golden_lake', darkScenery: input('dark_scenery'),
      period, format: input('format') || 'apng', chrome: input('chrome'),
      stats: input('stats') !== 'false', timezone: input('timezone') || undefined,
      outDir: path.join(os.tmpdir(), 'commit-forest-out'),
    });
    // COMMIT_FOREST_DRY_RUN draws the images and stops there (for trying the bundle locally)
    if (!process.env.COMMIT_FOREST_DRY_RUN) publish(files, { repo, branch, token });
    summary(`### Your forest has ${forest.stats.trees.toLocaleString('en-US')} trees\n\n`
      + `Put this in your README.md:\n\n\`\`\`html\n${snippet({ repo, branch, files, alt })}\n\`\`\``);
  } catch (e) {
    summary(`### The forest wasn't redrawn this time\n\nYesterday's images stay as they are. The reason:\n\n\`\`\`\n${e.stack || e}\n\`\`\``);
    console.log(`::warning::Commit Forest: ${e.message}`);
  }
}

main();
