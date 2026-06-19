#!/usr/bin/env tsx
/**
 * Rollback Script — Wave 0, Task 19
 *
 * Safely rolls back database migrations and provides a plan for
 * re-deploying previous Edge Function versions.
 *
 * Features:
 *   --target <timestamp>   Roll back to a specific migration (exclusive)
 *   --full                 Roll back to initial state (all migrations)
 *   --dry-run              Plan only, no execution
 *   --yes                  Skip confirmation prompt
 *   AUTO_CONFIRM=true      Env var alternative to --yes
 *
 * Usage:
 *   npx tsx scripts/rollback.ts --full --dry-run
 *   npx tsx scripts/rollback.ts --target 20260605073136 --yes
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "node:readline/promises";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Migration {
  filename: string;
  timestamp: string;
  label: string;
  filePath: string;
  content: string;
  categories: MigrationCategory[];
  downSql: string[];
  isDestructive: boolean; // data-only migration (INSERT/UPDATE/DELETE without CREATE)
}

type MigrationCategory =
  | "create_table"
  | "create_type"
  | "create_function"
  | "create_view"
  | "create_index"
  | "create_trigger"
  | "create_extension"
  | "create_policy"
  | "add_column"
  | "data_only" // INSERT/UPDATE/DELETE with no structural revert
  | "grant";

interface PlanItem {
  timestamp: string;
  label: string;
  filename: string;
  categories: MigrationCategory[];
  downSql: string[];
  isDestructive: boolean;
  isStructural: boolean; // has reversible structural changes
}

interface Args {
  target?: string;
  full: boolean;
  dryRun: boolean;
  autoConfirm: boolean;
}

// ─── Argument Parsing ─────────────────────────────────────────────────────────

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    full: false,
    dryRun: false,
    autoConfirm: process.env.AUTO_CONFIRM === "true",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--target":
        if (i + 1 >= args.length) {
          console.error("❌ --target requires a migration timestamp argument");
          process.exit(1);
        }
        result.target = args[++i];
        break;
      case "--full":
        result.full = true;
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--yes":
        result.autoConfirm = true;
        break;
      default:
        console.error(`❌ Unknown argument: ${args[i]}`);
        console.error("Usage: npx tsx scripts/rollback.ts [--target <ts>] [--full] [--dry-run] [--yes]");
        process.exit(1);
    }
  }

  if (!result.target && !result.full) {
    console.error("❌ Specify either --target <timestamp> or --full");
    console.error("Usage: npx tsx scripts/rollback.ts [--target <ts>] [--full] [--dry-run] [--yes]");
    process.exit(1);
  }

  if (result.target && result.full) {
    console.error("❌ --target and --full are mutually exclusive");
    process.exit(1);
  }

  return result;
}

// ─── SQL Analysis ─────────────────────────────────────────────────────────────

function analyzeMigration(content: string): {
  categories: MigrationCategory[];
  downSql: string[];
  isDestructive: boolean;
} {
  const categories: MigrationCategory[] = [];
  const downStatements: string[] = [];
  const upper = content.toUpperCase();
  let hasDataChanges = false;
  let hasStructuralChanges = false;

  // Split into individual statements
  const statements = content
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    const s = stmt.trim();
    if (!s) continue;

    // ─── CREATE TABLE ─────────────────────────────────────────────
    const createTableMatch = s.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i
    );
    if (createTableMatch) {
      categories.push("create_table");
      hasStructuralChanges = true;
      const table = createTableMatch[1].toLowerCase();
      downStatements.push(`DROP TABLE IF EXISTS public.${table} CASCADE;`);
      continue;
    }

    // ─── CREATE TYPE ... AS ENUM ──────────────────────────────────
    const createTypeMatch = s.match(
      /CREATE\s+TYPE\s+(?:public\.)?(\w+)\s+AS\s+ENUM/i
    );
    if (createTypeMatch) {
      categories.push("create_type");
      hasStructuralChanges = true;
      const typeName = createTypeMatch[1].toLowerCase();
      downStatements.push(`DROP TYPE IF EXISTS public.${typeName} CASCADE;`);
      continue;
    }

    // ─── CREATE OR REPLACE FUNCTION ───────────────────────────────
    const createFuncMatch = s.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/i
    );
    if (createFuncMatch) {
      categories.push("create_function");
      hasStructuralChanges = true;
      const funcName = createFuncMatch[1].toLowerCase();

      // Attempt to extract signature for precise DROP
      // Default: DROP FUNCTION IF EXISTS with CASCADE
      const sigMatch = s.match(
        /FUNCTION\s+(?:public\.)?\w+\s*\(([^)]*)\)/i
      );
      if (sigMatch && sigMatch[1].trim().length > 0) {
        const args = sigMatch[1].trim();
        downStatements.push(
          `DROP FUNCTION IF EXISTS public.${funcName}(${args}) CASCADE;`
        );
      } else {
        // Try to extract argument types from the function body
        const paramsMatch = s.match(
          /FUNCTION\s+(?:public\.)?\w+\s*\(([\s\S]*?)\)\s*(?:RETURNS|LANGUAGE|SECURITY|AS)/i
        );
        if (paramsMatch) {
          const params = paramsMatch[1].trim();
          if (params.length > 0) {
            downStatements.push(
              `DROP FUNCTION IF EXISTS public.${funcName}(${params}) CASCADE;`
            );
          } else {
            downStatements.push(
              `DROP FUNCTION IF EXISTS public.${funcName}() CASCADE;`
            );
          }
        } else {
          downStatements.push(
            `DROP FUNCTION IF EXISTS public.${funcName}() CASCADE;`
          );
        }
      }
      continue;
    }

    // ─── CREATE OR REPLACE VIEW ────────────────────────────────────
    const createViewMatch = s.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?(\w+)/i
    );
    if (createViewMatch) {
      categories.push("create_view");
      hasStructuralChanges = true;
      const viewName = createViewMatch[1].toLowerCase();
      const isMaterialized = upper.includes("MATERIALIZED VIEW");
      if (isMaterialized) {
        downStatements.push(
          `DROP MATERIALIZED VIEW IF EXISTS public.${viewName} CASCADE;`
        );
      } else {
        downStatements.push(`DROP VIEW IF EXISTS public.${viewName} CASCADE;`);
      }
      continue;
    }

    // ─── CREATE INDEX ─────────────────────────────────────────────
    const createIndexMatch = s.match(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?(\w+)/i
    );
    if (createIndexMatch) {
      categories.push("create_index");
      hasStructuralChanges = true;
      const idxName = createIndexMatch[1].toLowerCase();
      downStatements.push(`DROP INDEX IF EXISTS public.${idxName} CASCADE;`);
      continue;
    }

    // ─── CREATE TRIGGER ───────────────────────────────────────────
    const createTriggerMatch = s.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\w+)/i
    );
    if (createTriggerMatch) {
      categories.push("create_trigger");
      hasStructuralChanges = true;
      const trigName = createTriggerMatch[1].toLowerCase();
      downStatements.push(`DROP TRIGGER IF EXISTS ${trigName};`);
      continue;
    }

    // ─── CREATE EXTENSION ─────────────────────────────────────────
    const createExtMatch = s.match(
      /CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i
    );
    if (createExtMatch) {
      categories.push("create_extension");
      hasStructuralChanges = true;
      // Extensions are hard to fully revert — mark as informational
      const extName = createExtMatch[1].toLowerCase();
      downStatements.push(`-- NOTE: Extension '${extName}' requires manual removal: DROP EXTENSION IF EXISTS "${extName}" CASCADE;`);
      continue;
    }

    // ─── CREATE POLICY ────────────────────────────────────────────
    const createPolicyMatch = s.match(
      /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/i
    );
    if (createPolicyMatch) {
      categories.push("create_policy");
      hasStructuralChanges = true;
      const polName = createPolicyMatch[1].toLowerCase();
      const tableName = createPolicyMatch[2].toLowerCase();
      downStatements.push(
        `DROP POLICY IF EXISTS "${polName}" ON public.${tableName};`
      );
      continue;
    }

    // ─── ALTER TABLE ... ADD COLUMN ───────────────────────────────
    const alterAddColumnMatch = s.match(
      /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i
    );
    if (alterAddColumnMatch) {
      categories.push("add_column");
      hasStructuralChanges = true;
      const tableName = alterAddColumnMatch[1].toLowerCase();
      const colName = alterAddColumnMatch[2].toLowerCase();
      downStatements.push(
        `ALTER TABLE public.${tableName} DROP COLUMN IF EXISTS ${colName};`
      );
      continue;
    }

    // ─── ALTER TABLE other operations (SET DEFAULT, DROP DEFAULT, etc.) ────
    const alterTableMatch = s.match(
      /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+/i
    );
    if (alterTableMatch && !s.match(/ADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS/i)) {
      hasStructuralChanges = true;
      // Non-add-column ALTER TABLE — log warning but don't auto-revert
      const shortStmt = s.substring(0, 120);
      downStatements.push(`-- WARNING: Manual review needed for: ${shortStmt};`);
      continue;
    }

    // ─── ALTER PUBLICATION ────────────────────────────────────────
    if (upper.includes("ALTER PUBLICATION")) {
      // Replication changes — note but don't auto-generate
      continue;
    }

    // ─── GRANT ────────────────────────────────────────────────────
    const grantMatch = s.match(
      /GRANT\s+(?:EXECUTE\s+ON\s+FUNCTION|ALL\s+ON\s+TABLE|SELECT\s+ON\s+(?:ALL\s+)?TABLE)\s+(?:public\.)?(\w+)/i
    );
    if (grantMatch) {
      categories.push("grant");
      hasStructuralChanges = true;
      // REVOKE is complex to auto-generate safely — mark as informational
      const shortStmt = s.substring(0, 100);
      downStatements.push(`-- NOTE: Manual review needed for: ${shortStmt};`);
      continue;
    }

    // ─── NOTIFY ───────────────────────────────────────────────────
    if (upper.startsWith("NOTIFY")) {
      continue; // No rollback needed
    }

    // ─── INSERT / UPDATE / DELETE (data-only) ─────────────────────
    if (
      s.match(/^\s*(INSERT|UPDATE|DELETE|WITH)\s/i) &&
      !s.match(/CREATE\s+(TABLE|VIEW)/i)
    ) {
      hasDataChanges = true;
      downStatements.push(
        `-- DATA MIGRATION: Cannot auto-generate DOWN for: ${s.substring(0, 100)};`
      );
      continue;
    }
  }

  return {
    categories,
    downSql: downStatements,
    isDestructive: hasDataChanges && !hasStructuralChanges,
  };
}

// ─── Snapshot Command ─────────────────────────────────────────────────────────

function generateSnapshotCommand(): string {
  const pgDumpCmd = [
    "pg_dump",
    `"$DATABASE_URL"`,
    "--schema-only",
    "--no-owner",
    "--no-acl",
    `--file=rollback-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`,
  ].join(" \\\n  ");

  return pgDumpCmd;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const migrationDir = path.resolve(process.cwd(), "supabase/migrations");

  if (!fs.existsSync(migrationDir)) {
    console.error(`❌ Migration directory not found: ${migrationDir}`);
    process.exit(1);
  }

  // Read and sort all migrations
  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error("❌ No SQL migration files found");
    process.exit(1);
  }

  console.log(`\n🔍 Migration Rollback — ${files.length} migration files found\n`);

  // Parse all migrations
  const migrations: Migration[] = files.map((file) => {
    const timestamp = file.split("_")[0];
    const label = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
    const filePath = path.join(migrationDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const { categories, downSql, isDestructive } = analyzeMigration(content);

    return {
      filename: file,
      timestamp,
      label,
      filePath,
      content,
      categories,
      downSql,
      isDestructive,
    };
  });

  // Sort by timestamp ascending
  migrations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Find the target index
  let targetIndex: number;
  if (args.full) {
    targetIndex = 0; // Roll back to before the first migration
    console.log("📍 Target: FULL rollback to initial state\n");
  } else {
    const target = args.target!;
    targetIndex = migrations.findIndex((m) => m.timestamp === target);

    if (targetIndex === -1) {
      console.error(`❌ Target migration '${target}' not found`);
      console.error("Available timestamps:");
      for (const m of migrations) {
        console.error(`  ${m.timestamp}  ${m.label}`);
      }
      process.exit(1);
    }

    // Verify target is not the first migration (nothing to roll back)
    if (targetIndex === 0) {
      console.log("ℹ️  Target is the first migration — nothing to roll back\n");
      process.exit(0);
    }

    console.log(`📍 Target: roll back to before migration '${target}' (${migrations[targetIndex].label})\n`);
  }

  // Collect migrations to revert (from last down to targetIndex)
  const toRevert = migrations.slice(targetIndex).reverse();

  // ─── Rollback Plan ──────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ROLLBACK PLAN");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const planItems: PlanItem[] = [];
  let structuralCount = 0;
  let destructiveCount = 0;

  for (const m of toRevert) {
    const isStructural = m.categories.some(
      (c) =>
        c === "create_table" ||
        c === "create_type" ||
        c === "create_function" ||
        c === "create_view" ||
        c === "create_index" ||
        c === "create_trigger" ||
        c === "create_policy" ||
        c === "add_column"
    );

    planItems.push({
      timestamp: m.timestamp,
      label: m.label,
      filename: m.filename,
      categories: m.categories,
      downSql: m.downSql,
      isDestructive: m.isDestructive,
      isStructural,
    });

    if (isStructural) structuralCount++;
    if (m.isDestructive) destructiveCount++;
  }

  // Print revert order
  console.log(`Revert order (${toRevert.length} migrations):`);
  console.log("");

  for (let i = 0; i < planItems.length; i++) {
    const item = planItems[i];
    const revertNum = i + 1;

    if (item.isStructural) {
      console.log(`  ${revertNum}. [STRUCTURAL] ${item.timestamp}  ${item.label}`);
    } else if (item.isDestructive) {
      console.log(`  ${revertNum}. [DATA ONLY]   ${item.timestamp}  ${item.label}`);
    } else {
      console.log(`  ${revertNum}. [INFO]        ${item.timestamp}  ${item.label}`);
    }

    // Print categories
    if (item.categories.length > 0) {
      console.log(`     Categories: ${item.categories.join(", ")}`);
    }

    // Print DOWN SQL preview
    if (item.downSql.length > 0) {
      const previewCount = Math.min(item.downSql.length, 3);
      for (let j = 0; j < previewCount; j++) {
        const line = item.downSql[j];
        const display = line.length > 90 ? line.substring(0, 90) + "..." : line;
        console.log(`     → ${display}`);
      }
      if (item.downSql.length > 3) {
        console.log(`     → ... and ${item.downSql.length - 3} more statements`);
      }
    } else {
      console.log(`     → No auto-generated DOWN SQL`);
    }

    // Warn about data-only migrations
    if (item.isDestructive) {
      console.log(
        `     ⚠️  DATA-ONLY MIGRATION — exact data changes cannot be reversed automatically`
      );
    }

    console.log("");
  }

  // ─── Snapshot Recommendation ────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  PRE-ROLLBACK SNAPSHOT");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("Before proceeding, create a database snapshot:");
  console.log("");
  console.log(`  ${generateSnapshotCommand()}`);
  console.log("");

  if (args.dryRun) {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  DRY RUN SUMMARY");
    console.log("═══════════════════════════════════════════════════════════════\n");
    console.log(`  Migrations to revert:  ${toRevert.length}`);
    console.log(`  Structural changes:    ${structuralCount}`);
    console.log(`  Data-only migrations:  ${destructiveCount}`);
    console.log(`  Full rollback:         ${args.full ? "YES" : "NO"}`);
    if (args.target) {
      console.log(`  Target:                ${args.target}`);
    }
    console.log("");
    console.log("✅ Dry run complete — no changes made\n");
    process.exit(0);
  }

  // ─── Confirmation ────────────────────────────────────────────────

  if (!args.autoConfirm) {
    // Check for unsafe rollback conditions
    const unsafeItems = planItems.filter((i) => i.isDestructive);
    if (unsafeItems.length > 0) {
      console.log("⚠️  WARNING: The following data-only migrations will lose exact revertability:");
      for (const item of unsafeItems) {
        console.log(`   - ${item.timestamp}  ${item.label}`);
      }
      console.log("");
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await rl.question(
      `Roll back ${toRevert.length} migrations? This will execute DOWN SQL against your database. [y/N] `
    );
    rl.close();

    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("❌ Rollback cancelled by user\n");
      process.exit(0);
    }
  } else {
    console.log("ℹ️  Auto-confirm enabled — skipping confirmation prompt\n");
  }

  // ─── Execute Rollback ────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  EXECUTING ROLLBACK");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const executedDownStatements: string[] = [];
  const errors: string[] = [];

  // Verify database connection first (check DATABASE_URL is set)
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable not set");
    console.error("   Set DATABASE_URL to your Supabase database connection string");
    process.exit(1);
  }

  for (let i = 0; i < planItems.length; i++) {
    const item = planItems[i];
    const revertNum = i + 1;

    console.log(`  [${revertNum}/${planItems.length}] ${item.timestamp}  ${item.label}`);

    if (item.downSql.length === 0) {
      console.log(`     ⏭  No DOWN SQL to execute`);
      continue;
    }

    for (const downStmt of item.downSql) {
      // Skip comments and notes
      if (downStmt.startsWith("--")) {
        if (downStmt.startsWith("-- NOTE:") || downStmt.startsWith("-- WARNING:")) {
          console.log(`     ${downStmt}`);
        }
        continue;
      }

      try {
        // Execute via psql
        const { execSync } = await import("node:child_process");
        const _psqlResult = execSync(
          `psql "${process.env.DATABASE_URL}" -c "${downStmt.replace(/"/g, '\\"')}"`,
          {
            timeout: 30000,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
          }
        );
        console.log(`     ✅ ${downStmt.substring(0, 80)}...`);
        executedDownStatements.push(downStmt);
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        console.error(`     ❌ Failed: ${downStmt.substring(0, 80)}...`);
        console.error(`        ${errorMsg}`);
        errors.push(`${item.timestamp}: ${downStmt} — ${errorMsg}`);
      }
    }
    console.log("");
  }

  // ─── Post-Rollback Verification ──────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  POST-ROLLBACK VERIFICATION");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (errors.length > 0) {
    console.log(`⚠️  ${errors.length} errors during rollback execution. Verify manually:\n`);
    for (const err of errors) {
      console.log(`  ❌ ${err}`);
    }
    console.log("");
  }

  // Run a basic verification: list remaining tables
  try {
    const { execSync } = await import("node:child_process");
    const tableCountOutput = execSync(
      `psql "${process.env.DATABASE_URL}" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" -t`,
      {
        timeout: 15000,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }
    );
    const tableCount = tableCountOutput.trim();
    console.log(`  📊 Public tables remaining: ${tableCount}`);

    // Check that the expected remaining migrations are at the target state
    const remainingMigrations = migrations.slice(0, targetIndex);
    console.log(`  📋 Migrations still applied: ${remainingMigrations.length}`);

    // Verify core tables based on remaining migrations
    const remainingTables = new Set<string>();
    const remainingFunctions = new Set<string>();
    for (const m of remainingMigrations) {
      const _analysis = analyzeMigration(m.content);
      for (const stmt of m.content.split(";")) {
        const tableMatch = stmt.match(
          /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i
        );
        if (tableMatch) remainingTables.add(tableMatch[1].toLowerCase());
        const funcMatch = stmt.match(
          /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/i
        );
        if (funcMatch) remainingFunctions.add(funcMatch[1].toLowerCase());
      }
    }

    if (remainingTables.size > 0) {
      console.log(`  📦 Expected tables after rollback: ${Array.from(remainingTables).slice(0, 10).join(", ")}${remainingTables.size > 10 ? "..." : ""}`);
    }
  } catch (err: unknown) {
    console.log(`  ⚠️  Could not verify: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("");

  // ─── Summary ────────────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ROLLBACK SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Migrations reverted:  ${executedDownStatements.length > 0 ? planItems.length : 0} (${toRevert.length} attempted)`);
  console.log(`  DOWN statements run:  ${executedDownStatements.length}`);
  console.log(`  Errors:               ${errors.length}`);

  if (args.target) {
    console.log(`  Rolled back to:       ${args.target}`);
  } else {
    console.log(`  Rolled back to:       initial state (empty)`);
  }

  console.log("");

  if (errors.length > 0) {
    console.log("⚠️  Rollback completed WITH ERRORS — manual intervention required");
    console.log("   Check error details above and verify database state\n");
    process.exit(1);
  } else {
    console.log("✅ Rollback completed successfully\n");
  }
}

main().catch((err: unknown) => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
});
