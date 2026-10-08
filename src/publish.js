// Push the images to their own branch of the user's repo, as one commit that replaces the
// last: the branch never grows a history, and the default branch is never touched. Commits
// by the Actions bot on a side branch don't count as contributions, so the forest never
// feeds itself.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BRANCH_README = `# Commit Forest

The images on this branch are redrawn by the Commit Forest workflow and replaced on every
run. Point your README at them; don't edit them here.
`;

/* The repository's default branch, from the event that started the run (null if unknown). */
function defaultBranch() {
  try {
    return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).repository.default_branch || null;
  } catch {
    return null;
  }
}

export function publish(files, { repo, branch, token }) {
  // the push replaces the branch outright, so it must never be one that holds the user's work
  const guarded = [defaultBranch(), process.env.GITHUB_REF_NAME, 'main', 'master'].filter(Boolean);
  if (guarded.includes(branch)) {
    throw new Error(`the branch input is "${branch}", which holds your repository's own files; the images go to a branch of their own, such as output`);
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'commit-forest-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', branch);
  for (const f of files) copyFileSync(f, path.join(dir, path.basename(f)));
  writeFileSync(path.join(dir, 'README.md'), BRANCH_README);
  git('add', '-A');
  git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-q', '-m', 'Grow the forest');
  // the token goes in through git's environment rather than the command line, which a
  // failed command prints
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  try {
    execFileSync('git', ['push', '-q', '--force', `https://github.com/${repo}.git`, `HEAD:refs/heads/${branch}`], {
      cwd: dir, stdio: 'pipe',
      env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}` },
    });
  } catch (e) {
    const said = String(e.stderr || e.message);
    if (/403|denied|not allowed/i.test(said)) {
      throw new Error('GitHub refused to let the workflow push the images. Add "permissions: contents: write" to the workflow; '
        + 'if it is there, set Settings > Actions > General > Workflow permissions to "Read and write"');
    }
    throw new Error(`pushing the images failed: ${said.trim()}`);
  }
}
