#!/usr/bin/env tsx
/**
 * Blitz Types Sync Check — T5.5
 *
 * Compares export interface/type names between:
 *   - src/types/blitz.ts        (frontend source of truth)
 *   - supabase/functions/_shared/blitz-types.ts (Deno mirror)
 *
 * Exits 0 if synchronized, 1 if mismatched.
 * This script is READ-ONLY — it never modifies files.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

const FRONTEND_FILE = path.resolve(ROOT, "src/types/blitz.ts");
const EDGE_FILE = path.resolve(ROOT, "supabase/functions/_shared/blitz-types.ts");

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Extract exported type/interface names from a TS source string. */
function extractExports(content: string): string[] {
  const names: string[] = [];
  // Match `export type Foo` and `export interface Bar`
  const regex = /export\s+(?:type|interface)\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names.sort();
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main(): void {
  // Check files exist
  for (const fp of [FRONTEND_FILE, EDGE_FILE]) {
    if (!fs.existsSync(fp)) {
      console.error(`❌ File not found: ${fp}`);
      process.exit(1);
    }
  }

  const frontendContent = fs.readFileSync(FRONTEND_FILE, "utf-8");
  const edgeContent = fs.readFileSync(EDGE_FILE, "utf-8");

  const frontendExports = extractExports(frontendContent);
  const edgeExports = extractExports(edgeContent);

  const frontendSet = new Set(frontendExports);
  const edgeSet = new Set(edgeExports);

  const frontendOnly = frontendExports.filter((n) => !edgeSet.has(n));
  const edgeOnly = edgeExports.filter((n) => !frontendSet.has(n));

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  BLITZ TYPES SYNC CHECK");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`  Frontend file: ${path.relative(ROOT, FRONTEND_FILE)}`);
  console.log(`  Edge file:     ${path.relative(ROOT, EDGE_FILE)}\n`);

  console.log(`  Frontend exports (${frontendExports.length}):`);
  for (const name of frontendExports) {
    console.log(`    • ${name}`);
  }

  console.log(`\n  Edge exports (${edgeExports.length}):`);
  for (const name of edgeExports) {
    console.log(`    • ${name}`);
  }

  console.log("");

  const totalDiff = frontendOnly.length + edgeOnly.length;

  if (totalDiff === 0) {
    console.log("  ✅ TYPES ARE IN SYNC — no differences found\n");
    process.exit(0);
  }

  if (frontendOnly.length > 0) {
    console.log(
      `  ⚠️  In frontend but MISSING from edge file (${frontendOnly.length}):`
    );
    for (const name of frontendOnly) {
      console.log(`      - ${name}`);
    }
    console.log("");
  }

  if (edgeOnly.length > 0) {
    console.log(
      `  ⚠️  In edge file but MISSING from frontend (${edgeOnly.length}):`
    );
    for (const name of edgeOnly) {
      console.log(`      - ${name}`);
    }
    console.log("");
  }

  console.log(`  ❌ TYPES ARE OUT OF SYNC — ${totalDiff} difference(s) found\n`);
  console.log("  Run `cp src/types/blitz.ts supabase/functions/_shared/blitz-types.ts`");
  console.log("  then manually reconcile (edge file has Deno-specific additions).\n");

  process.exit(1);
}

main();
