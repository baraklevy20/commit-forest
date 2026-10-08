// The Action. A scheduled run never fails: a failing scheduled workflow is switched off by
// GitHub after 60 days, so on any error it leaves the last images where they are, says why
// in the run summary, and finishes green. A run started by hand or by a push does fail.

import { appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { grow } from './grow.js';
import { publish } from './publish.js';

// an input as given, or undefined when it is empty, so grow's own defaults apply
const input = name => (process.env[`INPUT_${name.toUpperCase()}`] || '').trim() || undefined;
// a yes/no input: on unless it says otherwise
const on = value => !/^(false|no|off|0)$/i.test(value || '');

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  console.log(markdown);
}

function snippet({ repo, branch, files, alt }) {
  const url = f => `https://raw.githubusercontent.com/${repo}/${branch}/${path.basename(f)}`;
  const { forest: light, 'forest-dark': dark } = files;
  const img = `<img alt="${alt}" src="${url(light)}">`;
  const inner = dark
    ? `<picture>\n    <source media="(prefers-color-scheme: dark)" srcset="${url(dark)}">\n    ${img}\n  </picture>`
    : img;
  return `<a href="https://github.com/baraklevy20/commit-forest">\n  ${inner}\n</a>`;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || 'you/you', token = input('token'), branch = input('branch') || 'output';
  try {
    const { forest, files, alt } = await grow({
      login: input('user') || repo.split('/')[0], token, scenery: input('scenery'), darkScenery: input('dark_scenery'),
      sceneries: input('sceneries'), gallery: input('gallery'), period: input('period'), format: input('format'),
      stats: on(input('stats')), label: on(input('label')), timezone: input('timezone'), chrome: input('chrome'),
      outDir: path.join(os.tmpdir(), 'commit-forest-out'),
    });
    // COMMIT_FOREST_DRY_RUN draws the images and stops there (for trying the bundle locally)
    if (!process.env.COMMIT_FOREST_DRY_RUN) publish(Object.values(files), { repo, branch, token });
    const n = forest.stats.trees;
    summary(`### Your forest has ${n.toLocaleString('en-US')} ${n === 1 ? 'tree' : 'trees'}\n\n`
      + `Put this in your README.md:\n\n\`\`\`html\n${snippet({ repo, branch, files, alt })}\n\`\`\``);
  } catch (e) {
    // (never the token, should an error ever carry it)
    const hide = text => (token ? String(text).split(token).join('***') : String(text));
    // A scheduled run stays green, since GitHub turns off a scheduled workflow that keeps
    // failing. A run someone started (the first one, from a push or the Run button) fails
    // for real, so a mistake in the setup shows as a red cross.
    const scheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
    summary(`### The forest wasn't drawn this time\n\n${scheduled ? "The images from the last run stay as they are. " : ''}`
      + `The reason: ${hide(e.message)}\n\n<details><summary>Details</summary>\n\n\`\`\`\n${hide(e.stack || e)}\n\`\`\`\n</details>`);
    console.log(`::${scheduled ? 'warning' : 'error'}::Commit Forest: ${hide(e.message)}`);
    if (!scheduled) process.exitCode = 1;
  }
}

main();
