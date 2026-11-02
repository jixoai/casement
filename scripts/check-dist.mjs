#!/usr/bin/env node
/**
 * Fail if dist/ is stale.
 *
 * casement ships compiled output because consumers install it by commit SHA
 * (github:jixoai/casement#<sha>&path:...), and a git dependency cannot be
 * trusted to run a build on the consumer's machine — the org has been bitten by
 * that in containers where filtered installs skip git deps entirely. Committing
 * dist/ removes the build from the consumption path, and this script removes the
 * obvious failure mode of committing it out of date.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) newest = Math.max(newest, newestMtime(full));
    else newest = Math.max(newest, stat.mtimeMs);
  }
  return newest;
}

const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

let distStat;
try {
  distStat = statSync(distDir);
} catch {
  console.error('check-dist: dist/ is missing. Run `pnpm build`.');
  process.exit(1);
}

const srcTime = newestMtime(srcDir);
const distTime = newestMtime(distDir);
if (srcTime > distTime) {
  console.error(
    'check-dist: dist/ is older than src/. Run `pnpm build` and commit dist/.',
  );
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const [name, target] of Object.entries(pkg.exports)) {
  const file = join(root, target.types.replace('./', ''));
  try {
    statSync(file);
  } catch {
    console.error('check-dist: export ' + name + ' points at a missing file: ' + target.types);
    process.exit(1);
  }
}

console.log('check-dist: dist/ is present and newer than src/ (' + relative(root, distDir) + ')');
