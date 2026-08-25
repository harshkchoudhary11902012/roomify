#!/usr/bin/env node
/**
 * Deploy lib/puter.worker.js to Puter, bypassing a CLI/SDK bug where
 * workers.create crashes on `sandboxApp.owner.uuid` when `owner` is missing.
 *
 * Usage:
 *   node scripts/deploy-worker.mjs [worker-name]
 *
 * Auth: PUTER_AUTH_TOKEN, or the token from `puter login`.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const workerFile = path.join(root, "lib", "puter.worker.js");
const workerName = (process.argv[2] || "roomify").toLowerCase();

function getToken() {
  if (process.env.PUTER_AUTH_TOKEN) return process.env.PUTER_AUTH_TOKEN.trim();

  const configPath = path.join(
    os.homedir(),
    "Library/Preferences/puter-cli-nodejs/config.json",
  );
  if (fs.existsSync(configPath)) {
    const conf = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = conf?.accounts?.[conf.active || "default"]?.token;
    if (token) return token;
  }

  throw new Error(
    "No Puter auth token. Run `puter login` or set PUTER_AUTH_TOKEN.",
  );
}

function loadPuterInit() {
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const require = createRequire(path.join(globalRoot, "@heyputer/cli/package.json"));
    return require("@heyputer/puter.js/src/init.cjs");
  } catch (err) {
    throw new Error(
      `Could not load @heyputer/cli SDK. Install with: npm install -g @heyputer/cli\n${err.message}`,
    );
  }
}

if (!fs.existsSync(workerFile)) {
  console.error(`Missing worker file: ${workerFile}`);
  process.exit(1);
}

const token = getToken();
const { init } = loadPuterInit();
const puter = init(token);

const remotePath = `~/Workers/${workerName}.js`;
const code = fs.readFileSync(workerFile);

console.log(`Uploading ${workerFile} → ${remotePath}`);
await puter.fs.write(remotePath, code, {
  overwrite: true,
  createMissingParents: true,
});

let existing = null;
try {
  existing = await puter.workers.get(workerName);
} catch {
  existing = null;
}

let url;
if (existing) {
  console.log(`Worker '${workerName}' exists — source updated in place.`);
  url = existing.url ?? `https://${workerName}.puter.work`;
} else {
  console.log(`Creating worker '${workerName}' (sandbox: false)...`);
  // sandbox:false skips the broken owner.uuid check in puter.js Workers.create
  const created = await puter.workers.create(workerName, remotePath, {
    sandbox: false,
  });
  url = created?.url ?? `https://${workerName}.puter.work`;
  console.log("Worker created.");
}

console.log("\nSet this in .env and restart the dev server:\n");
console.log(`VITE_PUTER_WORKER_URL=${url}`);
