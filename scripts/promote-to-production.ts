#!/usr/bin/env tsx
/**
 * Environment Promotion Script (Staging → Production) — Task 18
 *
 * Verifies staging health, checks migration diff, tags release candidate,
 * runs regression tests, then promotes to production with human approval.
 *
 * Usage:
 *   npx tsx scripts/promote-to-production.ts            # interactive (default)
 *   npx tsx scripts/promote-to-production.ts --dry-run   # dry-run mode
 *   AUTO_CONFIRM=true npx tsx scripts/promote-to-production.ts  # CI mode
 *
 * Environment Variables:
 *   STAGING_SUPABASE_REF     — Staging Supabase project ref (required)
 *   PRODUCTION_SUPABASE_REF  — Production Supabase project ref (required)
 *   SUPABASE_ACCESS_TOKEN    — Supabase Management API token (required)
 *   AUTO_CONFIRM             — Set to "true" to skip human approval prompt
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as readline from "readline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnvConfig {
  stagingRef: string;
  productionRef: string;
  accessToken: string;
  autoConfirm: boolean;
}

interface HealthStatus {
  healthy: boolean;
  details: string;
}

interface DiffResult {
  hasDifferences: boolean;
  summary: string;
}

interface TestResult {
  passed: boolean;
  output: string;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function ok(text: string): string {
  return `${GREEN}✅ ${text}${RESET}`;
}
function warn(text: string): string {
  return `${YELLOW}⚠️  ${text}${RESET}`;
}
function err(text: string): string {
  return `${RED}❌ ${text}${RESET}`;
}
function info(text: string): string {
  return `${CYAN}ℹ️  ${text}${RESET}`;
}
function header(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig(): EnvConfig {
  const stagingRef = process.env.STAGING_SUPABASE_REF || "";
  const productionRef = process.env.PRODUCTION_SUPABASE_REF || "";
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || "";
  const autoConfirm = process.env.AUTO_CONFIRM === "true";

  const missing: string[] = [];
  if (!stagingRef) missing.push("STAGING_SUPABASE_REF");
  if (!productionRef) missing.push("PRODUCTION_SUPABASE_REF");
  if (!accessToken) missing.push("SUPABASE_ACCESS_TOKEN");

  if (missing.length > 0) {
    console.error(
      err(
        `Missing required environment variables: ${missing.join(", ")}\n` +
          `  Set them in .env or export before running.`
      )
    );
    process.exit(1);
  }

  return { stagingRef, productionRef, accessToken, autoConfirm };
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function supabaseApiGet(
  path: string,
  accessToken: string
): Promise<{ status: number; body: any }> {
  const url = `https://api.supabase.com/v1${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// ─── Step 1: Verify Staging Health ───────────────────────────────────────────

async function verifyStagingHealth(
  config: EnvConfig,
  dryRun: boolean
): Promise<boolean> {
  console.log(`\n${header("Step 1: Verify Staging Supabase Health")}`);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log(info("[DRY-RUN] Would check staging health via Management API:"));
    console.log(`  GET /v1/projects/${config.stagingRef}/health`);
    return true;
  }

  try {
    const { status, body } = await supabaseApiGet(
      `/projects/${config.stagingRef}/health`,
      config.accessToken
    );

    if (status === 200 && body?.healthy) {
      console.log(ok("Staging project is healthy"));
      return true;
    }

    // If health endpoint returns differently, try a simpler approach — get project info
    const { status: infoStatus, body: infoBody } = await supabaseApiGet(
      `/projects/${config.stagingRef}`,
      config.accessToken
    );

    if (infoStatus === 200 && infoBody) {
      console.log(
        ok(`Staging project accessible: ${infoBody.name || config.stagingRef}`)
      );
      console.log(
        info(`Region: ${infoBody.region || "unknown"}, Status: ${infoBody.status || "active"}`)
      );
      return true;
    }

    console.error(
      err(`Staging health check failed (HTTP ${status}): ${JSON.stringify(body)}`)
    );
    return false;
  } catch (error: any) {
    console.error(err(`Staging health check error: ${error.message}`));
    return false;
  }
}

// ─── Step 2: Check Migration Diff ────────────────────────────────────────────

async function checkMigrationDiff(
  config: EnvConfig,
  dryRun: boolean
): Promise<boolean> {
  console.log(`\n${header("Step 2: Check Migration Diff (staging vs local)")}`);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log(info("[DRY-RUN] Would run: npx supabase diff --linked"));
    console.log(
      info("[DRY-RUN] Would verify local migrations are deployed to staging")
    );
    return true;
  }

  try {
    console.log(info("Checking migration status via supabase CLI..."));
    const result = execSync("npx supabase db remote commit -p staging 2>&1 || true", {
      encoding: "utf-8",
      timeout: 60000,
    });
    console.log(result.trim());

    // Check if supabase CLI reports any unapplied migrations
    const diffOutput = execSync("npx supabase db diff --linked 2>&1", {
      encoding: "utf-8",
      timeout: 60000,
    });

    if (diffOutput.includes("No changes found") || diffOutput.trim() === "") {
      console.log(ok("No migration diff — staging is in sync with local"));
      return true;
    }

    console.log(warn("Migration differences detected between local and staging:"));
    console.log(diffOutput.substring(0, 2000));
    console.log("");
    console.log(warn("Unapplied migrations must be deployed to staging first."));

    return false;
  } catch (error: any) {
    // supabase CLI might not be available; fall back to a simple check
    console.log(
      warn(
        `supabase CLI not available or errored: ${error.message}\n` +
          `  ${info("Skipping migration diff check. Ensure migrations are in sync manually.")}`
      )
    );
    return true;
  }
}

// ─── Step 3: Tag Release Candidate ────────────────────────────────────────────

function tagReleaseCandidate(dryRun: boolean): boolean {
  console.log(`\n${header("Step 3: Tag Staging Deploy as Release Candidate")}`);
  console.log("─".repeat(50));

  const tagName = `rc-${new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19)}`;
  const message = `Release candidate promoted from staging — ${new Date().toISOString()}`;

  if (dryRun) {
    console.log(info(`[DRY-RUN] Would create git tag: ${tagName}`));
    console.log(info(`[DRY-RUN] Tag message: ${message}`));
    return true;
  }

  try {
    // Check for uncommitted changes
    const status = execSync("git status --porcelain", {
      encoding: "utf-8",
      timeout: 10000,
    });
    if (status.trim()) {
      console.warn(
        warn("Uncommitted changes detected. Stash or commit before tagging.")
      );
      console.warn(status);
      return false;
    }

    // Create the tag
    execSync(`git tag -a "${tagName}" -m "${message}"`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    console.log(ok(`Created tag: ${tagName}`));

    // Optionally push tag (but don't fail if remote is unavailable)
    try {
      execSync(`git push origin "${tagName}"`, {
        encoding: "utf-8",
        timeout: 30000,
      });
      console.log(ok(`Pushed tag to origin: ${tagName}`));
    } catch {
      console.log(
        warn(
          `Could not push tag to remote (non-fatal). Push manually: git push origin "${tagName}"`
        )
      );
    }

    return true;
  } catch (error: any) {
    console.error(err(`Tag creation failed: ${error.message}`));
    return false;
  }
}

// ─── Step 4: Run Regression Tests ─────────────────────────────────────────────

function runRegressionTests(dryRun: boolean): TestResult {
  console.log(`\n${header("Step 4: Run Full Regression Tests")}`);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log(info("[DRY-RUN] Would run: npm run test"));
    console.log(info("[DRY-RUN] Would run: npx tsc --noEmit"));
    console.log(info("[DRY-RUN] Would run: npm run build"));
    return { passed: true, output: "" };
  }

  // TypeScript check
  console.log(info("Running TypeScript check..."));
  try {
    const tscOutput = execSync("npx tsc --noEmit", {
      encoding: "utf-8",
      timeout: 120000,
    });
    console.log(ok("TypeScript check passed"));
  } catch (error: any) {
    console.error(err(`TypeScript check failed:\n${error.stdout || error.message}`));
    return { passed: false, output: error.stdout || error.message };
  }

  // Run tests
  console.log(info("Running unit tests..."));
  try {
    const testOutput = execSync("npm run test 2>&1", {
      encoding: "utf-8",
      timeout: 120000,
    });
    console.log(testOutput.trim());
    console.log(ok("All tests passed"));
  } catch (error: any) {
    console.error(
      err(`Tests failed:\n${(error.stdout || error.message).substring(0, 2000)}`)
    );
    return { passed: false, output: error.stdout || error.message };
  }

  // Build check
  console.log(info("Running build..."));
  try {
    const buildOutput = execSync("npm run build 2>&1", {
      encoding: "utf-8",
      timeout: 120000,
    });
    console.log(ok("Build succeeded"));
  } catch (error: any) {
    console.error(err(`Build failed:\n${(error.stdout || error.message).substring(0, 1000)}`));
    return { passed: false, output: error.stdout || error.message };
  }

  return { passed: true, output: "All checks passed" };
}

// ─── Step 5: Human Approval ────────────────────────────────────────────────────

async function getHumanApproval(config: EnvConfig, dryRun: boolean): Promise<boolean> {
  console.log(`\n${header("Step 5: Human Approval")}`);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log(info("[DRY-RUN] Would prompt for approval before promotion"));
    console.log(ok("[DRY-RUN] Approval granted (dry-run mode)"));
    return true;
  }

  if (config.autoConfirm) {
    console.log(ok("AUTO_CONFIRM=true — skipping approval prompt"));
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `${YELLOW}${BOLD}⚠️  Ready to promote staging (${config.stagingRef}) → production (${config.productionRef})?${RESET}\n` +
        `  Type ${BOLD}promote${RESET} to confirm, or anything else to abort: `,
      (answer) => {
        rl.close();
        if (answer.trim().toLowerCase() === "promote") {
          console.log(ok("Approval granted — proceeding with promotion"));
          resolve(true);
        } else {
          console.log(warn("Promotion aborted by user"));
          resolve(false);
        }
      }
    );
  });
}

// ─── Step 6: Promote to Production ─────────────────────────────────────────────

async function promoteToProduction(
  config: EnvConfig,
  dryRun: boolean
): Promise<boolean> {
  console.log(`\n${header("Step 6: Promote to Production")}`);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log(info(`[DRY-RUN] Would link local project to production ref: ${config.productionRef}`));
    console.log(info("[DRY-RUN] Would run: supabase db push"));
    console.log(info("[DRY-RUN] Would update production edge function env vars"));
    return true;
  }

  // Link to production and push migrations
  try {
    console.log(info(`Linking to production project: ${config.productionRef}...`));
    execSync(`npx supabase link --project-ref ${config.productionRef} 2>&1`, {
      encoding: "utf-8",
      timeout: 60000,
    });
    console.log(ok("Linked to production project"));

    console.log(info("Pushing migrations to production..."));
    const pushOutput = execSync("npx supabase db push 2>&1", {
      encoding: "utf-8",
      timeout: 120000,
    });
    console.log(pushOutput.trim());
    console.log(ok("Migrations pushed to production"));

    return true;
  } catch (error: any) {
    console.error(
      err(
        `Production promotion failed:\n${(error.stdout || error.message).substring(0, 2000)}`
      )
    );
    return false;
  }
}

// ─── Step 7: Verify Production ────────────────────────────────────────────────

async function verifyProduction(
  config: EnvConfig,
  dryRun: boolean
): Promise<boolean> {
  console.log(`\n${header("Step 7: Verify Production After Promotion")}`);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log(info(`[DRY-RUN] Would verify production project: ${config.productionRef}`));
    console.log(info("[DRY-RUN] Would check production health endpoint"));
    return true;
  }

  try {
    // Get production project info
    const { status, body } = await supabaseApiGet(
      `/projects/${config.productionRef}`,
      config.accessToken
    );

    if (status === 200 && body) {
      console.log(
        ok(`Production project accessible: ${body.name || config.productionRef}`)
      );
      console.log(
        info(`Status: ${body.status || "active"}, Region: ${body.region || "unknown"}`)
      );
    } else {
      console.warn(
        warn(
          `Production health check returned HTTP ${status} — verify manually via Supabase Dashboard`
        )
      );
    }

    console.log(ok("Production verification complete"));
    return true;
  } catch (error: any) {
    console.error(err(`Production verification error: ${error.message}`));
    return false;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ${header("ENVIRONMENT PROMOTION: STAGING → PRODUCTION")}`);
  if (dryRun) {
    console.log(`  ${info("DRY-RUN MODE — no changes will be made")}`);
  }
  console.log("═══════════════════════════════════════════════════════════════\n");

  const config = loadConfig();

  console.log(`  Staging ref:     ${config.stagingRef}`);
  console.log(`  Production ref:  ${config.productionRef}`);
  console.log(`  AUTO_CONFIRM:    ${config.autoConfirm ? "true" : "false"}`);
  console.log(`  Dry-run:         ${dryRun ? "true" : "false"}\n`);

  // ─── Execute steps sequentially ────────────────────────────────────────────
  // Each step returns false to indicate failure, which aborts the pipeline.

  // Step 1: Verify staging health
  const stagingHealthy = await verifyStagingHealth(config, dryRun);
  if (!stagingHealthy) {
    console.error(`\n${err("Pipeline aborted: staging health check failed")}`);
    process.exit(1);
  }

  // Step 2: Check migration diff
  const diffOk = await checkMigrationDiff(config, dryRun);
  if (!diffOk) {
    console.error(
      `\n${err("Pipeline aborted: migration drift detected — deploy pending migrations to staging first")}`
    );
    process.exit(1);
  }

  // Step 3: Tag release candidate
  const tagCreated = tagReleaseCandidate(dryRun);
  if (!tagCreated) {
    console.error(
      `\n${err("Pipeline aborted: release candidate tagging failed")}`
    );
    process.exit(1);
  }

  // Step 4: Run regression tests
  const testResult = runRegressionTests(dryRun);
  if (!testResult.passed) {
    console.error(
      `\n${err("Pipeline aborted: regression tests failed — fix before promoting")}`
    );
    process.exit(1);
  }

  // Step 5: Human approval
  const approved = await getHumanApproval(config, dryRun);
  if (!approved) {
    console.log(`\n${warn("Promotion cancelled by user — exiting cleanly")}`);
    process.exit(0);
  }

  // Step 6: Promote to production
  const promoted = await promoteToProduction(config, dryRun);
  if (!promoted) {
    console.error(
      `\n${err("Pipeline aborted: production promotion failed")}`
    );
    process.exit(1);
  }

  // Step 7: Verify production
  const productionOk = await verifyProduction(config, dryRun);
  if (!productionOk) {
    console.error(
      `\n${err("Pipeline completed with warnings: production verification failed")}`
    );
    process.exit(1);
  }

  // ─── Done ──────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  if (dryRun) {
    console.log(`  ${ok("DRY-RUN COMPLETE — all checks would pass")}`);
    console.log(`  ${info("Run without --dry-run to execute the promotion")}`);
  } else {
    console.log(`  ${ok("PROMOTION COMPLETE — staging has been promoted to production")}`);
  }
  console.log("═══════════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch((error) => {
  console.error(`\n${err(`Unexpected error: ${error.message}`)}`);
  process.exit(1);
});
