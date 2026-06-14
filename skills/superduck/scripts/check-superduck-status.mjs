#!/usr/bin/env node

/**
 * Check if SuperDuck extension is installed and running
 * Exit codes:
 *   0 - SuperDuck is installed and socket is available
 *   1 - SuperDuck is installed but socket is not available
 *   2 - SuperDuck is not installed
 *   3 - Runtime error
 */

import { exec } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_SOCKET_PATH = '/tmp/chrome-native-host.sock';
const EXIT_RUNNING = 0;
const EXIT_INSTALLED_NOT_RUNNING = 1;
const EXIT_NOT_INSTALLED = 2;
const EXIT_ERROR = 3;

async function checkSuperduckInstalled() {
  try {
    const { stdout } = await execAsync('which superduck');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function checkSocketAvailable(socketPath = DEFAULT_SOCKET_PATH) {
  return existsSync(socketPath);
}

async function getSuperduckVersion() {
  try {
    const { stdout } = await execAsync('superduck version 2>&1');
    const match = stdout.match(/(?:version[:\s]+)?([0-9]+(?:\.[0-9]+)+)/i);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const socketPath = args.includes('--socket')
    ? args[args.indexOf('--socket') + 1]
    : DEFAULT_SOCKET_PATH;

  try {
    const installed = await checkSuperduckInstalled();
    const socketAvailable = await checkSocketAvailable(socketPath);
    const version = installed ? await getSuperduckVersion() : null;

    const result = {
      installed,
      running: installed && socketAvailable,
      socketPath,
      socketAvailable,
      version,
      exitCode: !installed ? EXIT_NOT_INSTALLED
        : !socketAvailable ? EXIT_INSTALLED_NOT_RUNNING
        : EXIT_RUNNING
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`SuperDuck CLI: ${installed ? 'installed' : 'NOT INSTALLED'}`);
      if (installed) {
        console.log(`Version: ${version}`);
        console.log(`Socket path: ${socketPath}`);
        console.log(`Socket available: ${socketAvailable ? 'YES' : 'NO'}`);
        console.log(`Status: ${socketAvailable ? 'RUNNING' : 'NOT RUNNING'}`);
      }
    }

    process.exit(result.exitCode);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(EXIT_ERROR);
  }
}

main();
