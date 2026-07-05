#!/usr/bin/env node

/**
 * Extract data from a webpage using SuperDuck CLI
 * Usage: node extract-data.mjs <url> <selector> [--output file.json]
 */

import { execFile } from 'child_process';
import { writeFileSync } from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function runSuperduck(args) {
  const { stdout } = await execFileAsync('superduck', args, {
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout;
}

function truncateForError(value) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length > 500
    ? `${normalized.slice(0, 500)}...`
    : normalized;
}

function parseJSONWithRaw(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `${label} returned invalid JSON: ${error.message}. Raw output: ${truncateForError(value)}`
    );
  }
}

async function runSuperduckJSON(args, label) {
  const stdout = await runSuperduck(['--json', ...args]);
  return parseJSONWithRaw(stdout, label);
}

async function extractData(url, selector, outputFile = null) {
  let sessionId = '';
  let tabId = '';
  try {
    sessionId = (await runSuperduck(['session', 'new'])).trim();

    // Reuse this task's session tab group, creating it only if needed.
    const tabPayload = await runSuperduckJSON([
      '--session',
      sessionId,
      'tab_group',
      'list',
      '--create-if-empty',
      '--name',
      'Extract data'
    ], 'tab_group list');
    tabId = tabPayload?.tabContext?.currentTabId
      ? String(tabPayload.tabContext.currentTabId)
      : '';
    if (!tabId) {
      throw new Error(
        `Failed to resolve session tab. Raw payload: ${truncateForError(JSON.stringify(tabPayload))}`
      );
    }

    // Navigate to URL
    await runSuperduck(['--session', sessionId, '--tab', tabId, 'navigate', url]);

    // Wait for page load (using context to verify)
    await runSuperduck(['--session', sessionId, '--tab', tabId, 'context']);

    // Extract data using JavaScript
    const selectorLiteral = JSON.stringify(selector);
    const jsCode = selector
      ? `JSON.stringify(Array.from(document.querySelectorAll(${selectorLiteral})).map(el => ({ text: el.textContent.trim(), html: el.innerHTML, href: el.href || null })))`
      : `JSON.stringify({ title: document.title, url: window.location.href, text: document.body.innerText.substring(0, 5000) })`;

    const dataPayload = await runSuperduckJSON([
      '--session',
      sessionId,
      '--tab',
      tabId,
      'exec',
      jsCode
    ], 'exec');
    if (!dataPayload.ok) {
      throw new Error(
        `exec failed: ${truncateForError(dataPayload.error || JSON.stringify(dataPayload))}`
      );
    }
    const data =
      typeof dataPayload.output === 'string'
        ? parseJSONWithRaw(dataPayload.output, 'exec output')
        : dataPayload.output;

    if (outputFile) {
      writeFileSync(outputFile, JSON.stringify(data, null, 2));
      console.log(`Data extracted and saved to ${outputFile}`);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }

    return data;
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
    return null;
  } finally {
    if (sessionId && tabId) {
      await runSuperduck([
        '--session',
        sessionId,
        'tab_group',
        'finalize',
        '--deliverable',
        tabId
      ]).catch(() => {});
    }
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.length < 1 || args.includes('--help')) {
  console.log(
    'Usage: node extract-data.mjs <url> [selector] [--output file.json]'
  );
  console.log('');
  console.log('Examples:');
  console.log('  node extract-data.mjs https://example.com');
  console.log(
    '  node extract-data.mjs https://news.ycombinator.com ".titleline > a"'
  );
  console.log('  node extract-data.mjs https://example.com --output data.json');
  process.exit(0);
}

const url = args[0];
const selector = args[1] && !args[1].startsWith('--') ? args[1] : null;
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;

extractData(url, selector, outputFile);
