#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const { platform, arch } = process;
const exeName = platform === "win32" ? "superduck.exe" : "superduck";
const pkg = `superduck-${platform}-${arch}`;

function randomHex(bytes) {
  try {
    return require("crypto").randomBytes(bytes).toString("hex");
  } catch {
    return `${Date.now()}${Math.random()}`.replace(/\D/g, "");
  }
}

function ensureAnalyticsId() {
  if (platform === "win32") return;
  const home = process.env.HOME;
  if (!home) return;

  const dir = path.join(home, ".superduck");
  const file = path.join(dir, "analytics-id");
  try {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : "";
    if (existing.startsWith("sdid-")) return;
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    fs.writeFileSync(file, `sdid-${randomHex(16)}\n`, { mode: 0o600 });
  } catch {
    // Analytics identity is best-effort; install must never fail because of it.
  }
}

let binPath;
try {
  binPath = require.resolve(`${pkg}/bin/${exeName}`);
} catch {
  const dev = path.resolve(__dirname, "..", "..", "chrome-native-host", "build", "superduck");
  if (fs.existsSync(dev)) binPath = dev;
}

if (!binPath) {
  console.error(`superduck: no prebuilt binary found for ${platform}-${arch}.`);
  console.error(`expected optional dependency '${pkg}'.`);
  console.error(`if you are on a supported platform, try: npm install -g --force superduck-cli`);  process.exit(127);
}

if (process.argv[2] === "--postinstall") {
  ensureAnalyticsId();
  try {
    if (platform !== "win32") fs.chmodSync(binPath, 0o755);
  } catch (e) {}
  process.exit(0);
}

const result = spawnSync(binPath, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error("superduck:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
