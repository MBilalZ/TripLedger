#!/usr/bin/env node
/**
 * Sync packages/types + packages/engine into supabase/functions/_shared
 * so Edge Functions use the same settlement code. CI fails on drift.
 *
 * Non-engine helpers in _shared (e.g. reportError.ts) are preserved.
 *
 *   pnpm sync:edge-engine          # write
 *   pnpm sync:edge-engine --check  # exit 1 if out of date
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "supabase/functions/_shared");
const typesSrc = join(root, "packages/types/src/index.ts");
const engineSrcDir = join(root, "packages/engine/src");
const checkOnly = process.argv.includes("--check");

/** Extra _shared files that are not generated from packages/* */
const PRESERVE = new Set(["reportError.ts"]);

function rewrite(source) {
  return source
    .replaceAll(/from ["']@tripledger\/types["']/g, 'from "./types.ts"')
    .replaceAll(/from ["'](\.\/[^"']+)\.js["']/g, 'from "$1.ts"');
}

function expectedFiles() {
  const files = new Map();
  files.set("types.ts", rewrite(readFileSync(typesSrc, "utf8")));

  for (const name of readdirSync(engineSrcDir).filter((f) => f.endsWith(".ts"))) {
    const body = rewrite(readFileSync(join(engineSrcDir, name), "utf8"));
    files.set(name, body);
  }

  // Thin entry used by recompute-settlement
  files.set("engine.ts", 'export { settleTrip } from "./settleTrip.ts";\n');

  return files;
}

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

const expected = expectedFiles();

if (checkOnly) {
  let ok = true;
  for (const [name, content] of expected) {
    const path = join(outDir, name);
    if (!existsSync(path)) {
      console.error(`Missing ${path}`);
      ok = false;
      continue;
    }
    const actual = normalize(readFileSync(path, "utf8"));
    if (actual !== normalize(content)) {
      console.error(`Drift: ${path} (run pnpm sync:edge-engine)`);
      ok = false;
    }
  }
  if (existsSync(outDir)) {
    for (const name of readdirSync(outDir)) {
      if (!expected.has(name) && !PRESERVE.has(name)) {
        console.error(`Unexpected file in _shared: ${name} (run pnpm sync:edge-engine)`);
        ok = false;
      }
    }
  }
  if (!ok) process.exit(1);
  console.log("Edge engine _shared is in sync with packages/engine + types.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
for (const [name, content] of expected) {
  writeFileSync(join(outDir, name), content, "utf8");
}
if (existsSync(outDir)) {
  for (const name of readdirSync(outDir)) {
    if (!expected.has(name) && !PRESERVE.has(name)) {
      unlinkSync(join(outDir, name));
    }
  }
}
console.log(`Synced ${expected.size} engine files → supabase/functions/_shared`);
