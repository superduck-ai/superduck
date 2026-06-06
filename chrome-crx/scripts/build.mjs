#!/usr/bin/env bun

/**
 * Build script for multi-browser extension support.
 * Sets BUILD_TARGET env var and delegates to Vite.
 *
 * Usage: bun scripts/build.mjs [chrome|edge]
 */

import { spawn } from 'child_process';

const TARGET = process.argv[2] || 'chrome';

if (!['chrome', 'edge'].includes(TARGET)) {
  console.error(`Error: Invalid target "${TARGET}". Use "chrome" or "edge".`);
  process.exit(1);
}

console.log(`\n🦆 Building for target: ${TARGET}\n`);

const viteProcess = spawn('bun', ['run', 'vite', 'build'], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    BUILD_TARGET: TARGET
  }
});

viteProcess.on('close', (code, signal) => {
  if (code !== null && code !== 0) {
    console.error(`\n❌ Build failed with code ${code}\n`);
    process.exit(code);
  }

  if (signal) {
    console.error(`\n❌ Build terminated by signal: ${signal}\n`);
    process.exit(1);
  }

  console.log(`\n✅ Build complete for target: ${TARGET}\n`);

  if (TARGET === 'edge') {
    console.log('📦 Edge extension package is ready in dist/');
    console.log('   Load it in Edge at: edge://extensions/');
    console.log('   Note the new Extension ID for native host configuration.\n');
  }
});
