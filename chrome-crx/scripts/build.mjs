#!/usr/bin/env node

/**
 * Build script that transforms manifest.json for different browser targets.
 * Usage: node scripts/build.mjs [chrome|edge]
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

const TARGET = process.argv[2] || 'chrome';
const PROJECT_DIR = resolve(process.cwd());
const MANIFEST_SRC = resolve(PROJECT_DIR, 'manifest.json');
const MANIFEST_DIST = resolve(PROJECT_DIR, 'dist', 'manifest.json');

console.log(`\n🦆 Building for target: ${TARGET}\n`);

// Read original manifest
const manifest = JSON.parse(readFileSync(MANIFEST_SRC, 'utf8'));

// Transform based on target
if (TARGET === 'edge') {
  console.log('Transforming manifest for Microsoft Edge...');

  // Remove Chrome-specific fields
  delete manifest.key;
  delete manifest.update_url;

  // Update description
  manifest.description = manifest.description.replace('in Chrome', 'in Edge');

  // Change minimum_chrome_version to minimum_edge_version
  if (manifest.minimum_chrome_version) {
    manifest.minimum_edge_version = manifest.minimum_chrome_version;
    delete manifest.minimum_chrome_version;
  }

  console.log('  ✓ Removed "key" field');
  console.log('  ✓ Removed "update_url" field');
  console.log('  ✓ Updated description');
  console.log('  ✓ Changed minimum_chrome_version to minimum_edge_version');
}

// Run Vite build
console.log('\nRunning Vite build...\n');
const viteProcess = spawn('bun', ['run', 'vite', 'build'], {
  stdio: 'inherit',
  cwd: PROJECT_DIR
});

viteProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`\n❌ Vite build failed with code ${code}\n`);
    process.exit(code);
  }

  // Write transformed manifest to dist/
  if (TARGET === 'edge') {
    console.log('\nWriting transformed manifest to dist/manifest.json...');
    writeFileSync(MANIFEST_DIST, JSON.stringify(manifest, null, 2) + '\n');
    console.log('  ✓ Manifest transformed and written to dist/');
  }

  console.log(`\n✅ Build complete for target: ${TARGET}\n`);

  if (TARGET === 'edge') {
    console.log('📦 Edge extension package is ready in dist/');
    console.log('   Load it in Edge at: edge://extensions/');
    console.log('   Remember to note the new Extension ID for native host configuration.\n');
  }
});
