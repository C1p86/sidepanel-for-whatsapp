#!/usr/bin/env node
// Bumps the version in manifest.json, commits, tags and pushes. The pushed tag starts
// .github/workflows/release.yml, which builds the zip and publishes the GitHub release.
//
// Usage: node scripts/release.mjs <patch|minor|major> [--dry-run]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'manifest.json');
const VERSION_LINE = /^(\s*"version":\s*")(\d+)\.(\d+)\.(\d+)(",?\s*)$/m;
const BRANCH = 'main';
const REMOTE = 'origin';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function nextVersion(major, minor, patch, level) {
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const levels = args.filter((arg) => arg !== '--dry-run');
if (levels.length !== 1 || !['patch', 'minor', 'major'].includes(levels[0])) {
  fail('usage: node scripts/release.mjs <patch|minor|major> [--dry-run]');
}

const manifest = readFileSync(MANIFEST, 'utf8');
const match = manifest.match(VERSION_LINE);
if (!match) fail('no x.y.z version found in manifest.json');
const current = `${match[2]}.${match[3]}.${match[4]}`;
const version = nextVersion(Number(match[2]), Number(match[3]), Number(match[4]), levels[0]);
const tag = `v${version}`;

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== BRANCH) fail(`releases start from ${BRANCH}, not ${branch}`);
if (git('status', '--porcelain')) fail('the working tree has uncommitted changes');

git('fetch', '--tags', REMOTE, BRANCH);
if (git('rev-parse', 'HEAD') !== git('rev-parse', `${REMOTE}/${BRANCH}`)) {
  fail(`${BRANCH} is not in sync with ${REMOTE}/${BRANCH}`);
}
if (git('tag', '--list', tag)) fail(`tag ${tag} already exists`);

if (dryRun) {
  console.log(`Dry run: ${current} -> ${version}. Checks passed, nothing was changed.`);
  console.log(`Would commit "Release ${tag}", create tag ${tag} and push both to ${REMOTE}.`);
  process.exit(0);
}

writeFileSync(MANIFEST, manifest.replace(VERSION_LINE, `$1${version}$5`));
git('add', 'manifest.json');
git('commit', '-m', `Release ${tag}`);
git('tag', '-a', tag, '-m', `Release ${tag}`);

try {
  git('push', '--atomic', REMOTE, BRANCH, tag);
} catch (error) {
  console.error(error.stderr || error.message);
  fail(`push failed, nothing was published. To undo locally: git tag -d ${tag} && git reset --hard HEAD~1`);
}

console.log(`Pushed ${tag} (${current} -> ${version}). GitHub Actions will publish the release.`);
