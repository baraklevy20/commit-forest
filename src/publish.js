// Push the images to their own branch of the user's repo, as one commit that replaces the
// last: the branch never grows a history, and the default branch is never touched. Commits
// by the Actions bot on a side branch don't count as contributions, so the forest never
// feeds itself.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BRANCH_README = `# Commit Forest

The images on this branch are redrawn by the Commit Forest workflow and replaced on every
run. Point your README at them; don't edit them here.
`;

export function publish(files, { repo, branch, token }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'commit-forest-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', branch);
  for (const f of files) copyFileSync(f, path.join(dir, path.basename(f)));
  writeFileSync(path.join(dir, 'README.md'), BRANCH_README);
  git('add', '-A');
  git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-q', '-m', 'Grow the forest');
  git('push', '-q', '--force', `https://x-access-token:${token}@github.com/${repo}.git`, `HEAD:refs/heads/${branch}`);
}
