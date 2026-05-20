#!/usr/bin/env node
// Enforce a minimum release age on dependency bumps.
//
// Walks the changes in a PR diff (or local working tree) for the supported
// manifests and, for every version bump it can identify, asks the upstream
// registry when that exact version was published. If the publish date is
// younger than MIN_RELEASE_AGE_DAYS, the script fails with a non-zero exit
// code so CI blocks the merge.
//
// This implements our `min_release_age` policy in addition to the
// Dependabot `cooldown` block in .github/dependabot.yml — the cooldown
// prevents Dependabot from *opening* the PR too early; this script
// prevents *any* PR (manual, agent, or third-party) from sneaking a
// just-released package in by hand.
//
// Supported manifests:
//   * package.json (npm registry)
//   * go.mod       (proxy.golang.org)
//
// Usage:
//   node scripts/check-min-release-age.mjs [--base <ref>] [--days N]
//
// Defaults: base=origin/main (falls back to HEAD~1), days=3.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}

const MIN_DAYS = Number(
  args.get('--days') ?? process.env.MIN_RELEASE_AGE_DAYS ?? 3,
);
const BASE_REF = args.get('--base') ?? process.env.BASE_REF ?? 'origin/main';

if (!Number.isFinite(MIN_DAYS) || MIN_DAYS < 0) {
  console.error(`Invalid --days value: ${MIN_DAYS}`);
  process.exit(2);
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8' });
}

function pickBaseRef() {
  try {
    git('rev-parse', '--verify', BASE_REF);
    return BASE_REF;
  } catch {
    try {
      git('rev-parse', '--verify', 'HEAD~1');
      return 'HEAD~1';
    } catch {
      return null;
    }
  }
}

const baseRef = pickBaseRef();
if (!baseRef) {
  console.log('No base ref available (initial commit?). Skipping check.');
  process.exit(0);
}

const SUPPORTED = [/(^|\/)package\.json$/, /(^|\/)go\.mod$/];
const changedFiles = git('diff', '--name-only', `${baseRef}...HEAD`)
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => SUPPORTED.some((re) => re.test(f)));

if (changedFiles.length === 0) {
  console.log('No dependency manifests changed; min-release-age check skipped.');
  process.exit(0);
}

console.log(
  `Checking minimum release age (>= ${MIN_DAYS} days) for ${changedFiles.length} manifest(s)`,
);

const violations = [];
const checked = [];

const OWN_PACKAGES_RE = /^superduck(-|$)/;

async function checkNpm(name, version) {
  if (OWN_PACKAGES_RE.test(name)) return;
  // Strip semver range prefixes (^, ~, >=, etc.) — registry needs exact
  // versions, but Dependabot bumps usually pin to one.
  const v = version.replace(/^[\^~>=<v ]+/, '').split(/\s/)[0];
  if (!/^\d/.test(v)) return; // skip "workspace:*", git URLs, file:, etc.
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  warn: npm registry ${name} -> ${res.status}, skipped`);
    return;
  }
  const json = await res.json();
  const publishedAt = json.time?.[v];
  if (!publishedAt) {
    console.warn(`  warn: no publish date for ${name}@${v}, skipped`);
    return;
  }
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  checked.push({ ecosystem: 'npm', name, version: v, ageDays });
  if (ageDays < MIN_DAYS) {
    violations.push(
      `npm:${name}@${v} published ${ageDays.toFixed(1)}d ago (< ${MIN_DAYS}d)`,
    );
  }
}

async function checkGoMod(modulePath, version) {
  // proxy.golang.org expects lowercased module path; fetch .info for publish time
  const lower = modulePath.replace(/[A-Z]/g, (c) => '!' + c.toLowerCase());
  const url = `https://proxy.golang.org/${lower}/@v/${encodeURIComponent(version)}.info`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(
      `  warn: go proxy ${modulePath}@${version} -> ${res.status}, skipped`,
    );
    return;
  }
  const json = await res.json();
  if (!json.Time) {
    console.warn(`  warn: no Time field for ${modulePath}@${version}, skipped`);
    return;
  }
  const ageDays = (Date.now() - new Date(json.Time).getTime()) / 86_400_000;
  checked.push({ ecosystem: 'go', name: modulePath, version, ageDays });
  if (ageDays < MIN_DAYS) {
    violations.push(
      `go:${modulePath}@${version} published ${ageDays.toFixed(1)}d ago (< ${MIN_DAYS}d)`,
    );
  }
}

function diffLines(file) {
  return git('diff', `${baseRef}...HEAD`, '--', file).split('\n');
}

function newDepsFromPackageJson(file) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return [];
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  const all = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };

  const lines = diffLines(file);
  // Match `+    "pkg": "1.2.3",` or `+    "pkg": "^1.2.3",`
  const re = /^\+\s*"([^"]+)"\s*:\s*"([^"]+)"/;
  const found = [];
  for (const line of lines) {
    if (line.startsWith('+++')) continue;
    if (!line.startsWith('+')) continue;
    const m = line.match(re);
    if (!m) continue;
    const [, name, version] = m;
    if (all[name] !== version) continue; // skip non-dep keys (scripts etc.)
    found.push({ name, version });
  }
  return found;
}

function newDepsFromGoMod(file) {
  const lines = diffLines(file);
  // require <module> <version>  OR plain "<module> <version>" inside require ( ... )
  const found = [];
  for (const line of lines) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const m = line
      .replace(/^\+/, '')
      .trim()
      .match(/^(?:require\s+)?([^\s]+)\s+(v[\w.\-+]+)\s*(\/\/.*)?$/);
    if (!m) continue;
    const [, modulePath, version] = m;
    if (!modulePath.includes('.') && !modulePath.includes('/')) continue;
    found.push({ name: modulePath, version });
  }
  return found;
}

const tasks = [];
for (const file of changedFiles) {
  console.log(`  scanning ${file}`);
  if (file.endsWith('package.json')) {
    for (const dep of newDepsFromPackageJson(file)) {
      tasks.push(checkNpm(dep.name, dep.version));
    }
  } else if (file.endsWith('go.mod')) {
    for (const dep of newDepsFromGoMod(file)) {
      tasks.push(checkGoMod(dep.name, dep.version));
    }
  }
}

await Promise.all(tasks);

console.log('');
console.log(`Checked ${checked.length} dependency bump(s):`);
for (const c of checked) {
  console.log(
    `  ${c.ecosystem}:${c.name}@${c.version}  age=${c.ageDays.toFixed(1)}d`,
  );
}

if (violations.length > 0) {
  console.error('');
  console.error(
    `min-release-age FAIL — ${violations.length} bump(s) under ${MIN_DAYS}d:`,
  );
  for (const v of violations) console.error(`  - ${v}`);
  console.error('');
  console.error(
    'Wait for the cooldown window or set MIN_RELEASE_AGE_DAYS lower for an exception.',
  );
  process.exit(1);
}

console.log('');
console.log('min-release-age OK');
