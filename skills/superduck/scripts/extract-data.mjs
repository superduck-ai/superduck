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

function stripTabContext(stdout) {
  return stdout.split(/\n\s*\nTab Context:/)[0].trim();
}

async function extractData(url, selector, outputFile = null) {
  try {
    // Create a new tab
    const tabOutput = await runSuperduck(['tab_group', 'new']);
    const tabMatch = tabOutput.match(/Tab ID:\s*(\d+)/);
    if (!tabMatch) {
      throw new Error('Failed to create tab');
    }
    const tabId = tabMatch[1];

    // Navigate to URL
    await runSuperduck(['--tab', tabId, 'navigate', url]);

    // Wait for page load (using context to verify)
    await runSuperduck(['--tab', tabId, 'context']);

    // Extract data using JavaScript
    const selectorLiteral = JSON.stringify(selector);
    const jsCode = selector
      ? `JSON.stringify(Array.from(document.querySelectorAll(${selectorLiteral})).map(el => ({ text: el.textContent.trim(), html: el.innerHTML, href: el.href || null })))`
      : `JSON.stringify({ title: document.title, url: window.location.href, text: document.body.innerText.substring(0, 5000) })`;

    const dataOutput = await runSuperduck(['--tab', tabId, 'exec', jsCode]);

    const data = JSON.parse(stripTabContext(dataOutput));

    if (outputFile) {
      writeFileSync(outputFile, JSON.stringify(data, null, 2));
      console.log(`Data extracted and saved to ${outputFile}`);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }

    return data;
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.length < 1 || args.includes('--help')) {
  console.log('Usage: node extract-data.mjs <url> [selector] [--output file.json]');
  console.log('');
  console.log('Examples:');
  console.log('  node extract-data.mjs https://example.com');
  console.log('  node extract-data.mjs https://news.ycombinator.com ".titleline > a"');
  console.log('  node extract-data.mjs https://example.com --output data.json');
  process.exit(0);
}

const url = args[0];
const selector = args[1] && !args[1].startsWith('--') ? args[1] : null;
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;

extractData(url, selector, outputFile);
