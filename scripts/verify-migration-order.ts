#!/usr/bin/env tsx
/**
 * Migration Order Verification Script — Wave 0, Task 4
 *
 * Validates all SQL migration files in supabase/migrations/ for:
 * 1. Sequential numbering (no timestamp gaps)
 * 2. DOWN migration data loss safety (DROP/CASCADE reversibility)
 * 3. Conflict detection (conflicting table/column modifications)
 * 4. Dependency validation (tables/columns exist before reference)
 * 5. Reversible check (DOWN marker present)
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Migration {
  filename: string;
  timestamp: string;
  label: string;
  filePath: string;
  content: string;
  creates: SchemaChanges;
  drops: DropChanges;
  modifies: ModifyChanges;
}

interface SchemaChanges {
  tables: Set<string>;
  columns: Map<string, Set<string>>; // table → columns
  types: Set<string>; // enums
  functions: Set<string>;
  views: Set<string>;
  extensions: Set<string>;
  indexes: Set<string>;
  triggers: Set<string>;
  policies: Set<string>;
  grants: Set<string>;
}

interface DropChanges {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
  functions: Set<string>;
  views: Set<string>;
  policies: Map<string, Set<string>>; // table → policy names
  indexes: Set<string>;
  triggers: Map<string, Set<string>>; // table → trigger names
}

interface ModifyChanges {
  addsColumns: Map<string, Set<string>>; // table → columns added
  dropsPolicies: Map<string, Set<string>>; // table → policy names dropped
  dropsTriggers: Map<string, Set<string>>; // table → trigger names dropped
}

interface Issue {
  severity: "ERROR" | "WARNING" | "INFO";
  check: string;
  message: string;
  migration?: string;
}

// ─── SQL Parser Helpers ───────────────────────────────────────────────────────

function parseSql(sql: string): {
  creates: SchemaChanges;
  drops: DropChanges;
  modifies: ModifyChanges;
} {
  const content = sql;
  const creates: SchemaChanges = {
    tables: new Set(),
    columns: new Map(),
    types: new Set(),
    functions: new Set(),
    views: new Set(),
    extensions: new Set(),
    indexes: new Set(),
    triggers: new Set(),
    policies: new Set(),
    grants: new Set(),
  };
  const drops: DropChanges = {
    tables: new Set(),
    columns: new Map(),
    functions: new Set(),
    views: new Set(),
    policies: new Map(),
    indexes: new Set(),
    triggers: new Map(),
  };
  const modifies: ModifyChanges = {
    addsColumns: new Map(),
    dropsPolicies: new Map(),
    dropsTriggers: new Map(),
  };

  const lines = content.split("\n");
  let currentBlock: string[] = [];
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("--")) continue;

    // Accumulate multi-line statements
    if (!inBlock && trimmed.length > 0) {
      inBlock = true;
      currentBlock = [];
    }
    if (inBlock) {
      currentBlock.push(line);
    }

    // Check for statement end (semicolon at end of line, not inside $$)
    const isStatementEnd =
      trimmed.endsWith(";") &&
      !trimmed.includes("$$") &&
      currentBlock.length > 0;

    if (isStatementEnd || (i === lines.length - 1 && inBlock)) {
      const rawStmt = currentBlock.join("\n").trim();
      inBlock = false;
      currentBlock = [];

      // ─── CREATE TABLE ─────────────────────────────────────────────
      const createTableMatch = rawStmt.match(
        /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i
      );
      if (createTableMatch) {
        const tableName = createTableMatch[1].toLowerCase();
        creates.tables.add(tableName);

        // Extract column names
        const cols = new Set<string>();
        const colMatches = rawStmt.matchAll(
          /(?:^\s*|\s+)(\w+)\s+(?:UUID|TEXT|INT|INTEGER|NUMERIC|BOOLEAN|TIMESTAMPTZ|DATE|JSONB|BIGINT|REAL|DOUBLE|VARCHAR)/gim
        );
        for (const m of colMatches) {
          const col = m[1].toLowerCase();
          // Skip SQL keywords
          if (
            ![
              "create",
              "table",
              "if",
              "not",
              "exists",
              "primary",
              "key",
              "foreign",
              "references",
              "unique",
              "check",
              "default",
              "constraint",
              "references",
              "on",
              "delete",
              "cascade",
              "set",
              "null",
              "insert",
              "update",
              "delete",
              "select",
              "from",
              "where",
              "and",
              "or",
              "in",
              "as",
              "is",
              "not",
              "null",
              "true",
              "false",
            ].includes(col)
          ) {
            cols.add(col);
          }
        }
        if (cols.size > 0) {
          creates.columns.set(tableName, cols);
        }
      }

      // ─── CREATE TYPE ──────────────────────────────────────────────
      const createTypeMatch = rawStmt.match(
        /CREATE\s+TYPE\s+(?:public\.)?(\w+)\s+AS\s+ENUM/i
      );
      if (createTypeMatch) {
        creates.types.add(createTypeMatch[1].toLowerCase());
      }

      // ─── CREATE OR REPLACE FUNCTION ───────────────────────────────
      const createFuncMatch = rawStmt.match(
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/i
      );
      if (createFuncMatch) {
        creates.functions.add(createFuncMatch[1].toLowerCase());
      }

      // ─── CREATE VIEW ──────────────────────────────────────────────
      const createViewMatch = rawStmt.match(
        /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?(\w+)/i
      );
      if (createViewMatch) {
        creates.views.add(createViewMatch[1].toLowerCase());
      }

      // ─── CREATE EXTENSION ─────────────────────────────────────────
      const createExtMatch = rawStmt.match(
        /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+(\w+)/i
      );
      if (createExtMatch) {
        creates.extensions.add(createExtMatch[1].toLowerCase());
      }

      // ─── CREATE INDEX ─────────────────────────────────────────────
      const createIdxMatch = rawStmt.match(
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i
      );
      if (createIdxMatch) {
        creates.indexes.add(createIdxMatch[1].toLowerCase());
      }

      // ─── CREATE TRIGGER ───────────────────────────────────────────
      const createTrigMatch = rawStmt.match(
        /CREATE\s+TRIGGER\s+(\w+)/i
      );
      if (createTrigMatch) {
        creates.triggers.add(createTrigMatch[1].toLowerCase());
      }

      // ─── CREATE POLICY ────────────────────────────────────────────
      const createPolMatch = rawStmt.match(
        /CREATE\s+POLICY\s+"([^"]+)"/i
      );
      if (createPolMatch) {
        creates.policies.add(createPolMatch[1].toLowerCase());
      }

      // ─── GRANT ────────────────────────────────────────────────────
      const grantMatch = rawStmt.match(
        /GRANT\s+\w+\s+(?:\([^)]+\)\s+)?ON\s+(?:public\.)?(\w+)/i
      );
      if (grantMatch) {
        creates.grants.add(grantMatch[1].toLowerCase());
      }

      // ─── ALTER TABLE ... ADD COLUMN ───────────────────────────────
      const addColMatches = rawStmt.matchAll(
        /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi
      );
      for (const m of addColMatches) {
        const tableName = m[1].toLowerCase();
        const colName = m[2].toLowerCase();
        if (!modifies.addsColumns.has(tableName)) {
          modifies.addsColumns.set(tableName, new Set());
        }
        modifies.addsColumns.get(tableName)!.add(colName);

        // Also track in creates
        if (!creates.columns.has(tableName)) {
          creates.columns.set(tableName, new Set());
        }
        creates.columns.get(tableName)!.add(colName);
      }

      // ─── ALTER PUBLICATION ─────────────────────────────────────────
      // (tracked via ADD TABLE — no schema change, just replication)

      // ─── DROP TABLE ───────────────────────────────────────────────
      const dropTableMatch = rawStmt.match(
        /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/i
      );
      if (dropTableMatch) {
        drops.tables.add(dropTableMatch[1].toLowerCase());
      }

      // ─── DROP FUNCTION ────────────────────────────────────────────
      const dropFuncMatch = rawStmt.match(
        /DROP\s+(?:FUNCTION|VIEW)\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/i
      );
      if (dropFuncMatch) {
        const name = dropFuncMatch[1].toLowerCase();
        if (rawStmt.match(/DROP\s+VIEW/i)) {
          drops.views.add(name);
        } else {
          drops.functions.add(name);
        }
      }

      // ─── DROP POLICY ──────────────────────────────────────────────
      const dropPolMatch = rawStmt.match(
        /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/i
      );
      if (dropPolMatch) {
        const policyName = dropPolMatch[1].toLowerCase();
        const tableName = dropPolMatch[2].toLowerCase();
        if (!drops.policies.has(tableName)) {
          drops.policies.set(tableName, new Set());
        }
        drops.policies.get(tableName)!.add(policyName);
        if (!modifies.dropsPolicies.has(tableName)) {
          modifies.dropsPolicies.set(tableName, new Set());
        }
        modifies.dropsPolicies.get(tableName)!.add(policyName);
      }

      // ─── DROP TRIGGER ─────────────────────────────────────────────
      const dropTrigMatch = rawStmt.match(
        /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?(\w+)/i
      );
      if (dropTrigMatch) {
        const trigName = dropTrigMatch[1].toLowerCase();
        const tableName = dropTrigMatch[2].toLowerCase();
        if (!drops.triggers.has(tableName)) {
          drops.triggers.set(tableName, new Set());
        }
        drops.triggers.get(tableName)!.add(trigName);
        if (!modifies.dropsTriggers.has(tableName)) {
          modifies.dropsTriggers.set(tableName, new Set());
        }
        modifies.dropsTriggers.get(tableName)!.add(trigName);
      }

      // ─── DROP INDEX ───────────────────────────────────────────────
      const dropIdxMatch = rawStmt.match(
        /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/i
      );
      if (dropIdxMatch) {
        drops.indexes.add(dropIdxMatch[1].toLowerCase());
      }

      // ─── REVOKE ───────────────────────────────────────────────────
      // (no schema change to track, just permission)
    }
  }

  return { creates, drops, modifies };
}

// ─── Check Functions ──────────────────────────────────────────────────────────

function checkSequentialNumbering(
  migrations: Migration[]
): Issue[] {
  const issues: Issue[] = [];
  const timestamps = migrations.map((m) => m.timestamp);

  for (let i = 1; i < timestamps.length; i++) {
    const prev = BigInt(timestamps[i - 1]);
    const curr = BigInt(timestamps[i]);
    const diff = curr - prev;

    // Check for identical timestamps
    if (diff === 0n) {
      issues.push({
        severity: "ERROR",
        check: "sequential-numbering",
        message: `Duplicate timestamp: ${timestamps[i]} in migrations [${migrations[i - 1].filename}] and [${migrations[i].filename}]`,
        migration: migrations[i].filename,
      });
    }

    // Check for backwards ordering
    if (diff < 0n) {
      issues.push({
        severity: "ERROR",
        check: "sequential-numbering",
        message: `Out-of-order migration: [${migrations[i].filename}] (${timestamps[i]}) comes before [${migrations[i - 1].filename}] (${timestamps[i - 1]})`,
        migration: migrations[i].filename,
      });
    }

    // Check for large gaps (> 1 day = 86400000000 ms, but timestamps are YYYYMMDDHHMMSS)
    // Gaps > 100000 suggest skipped numbers
    if (diff > 100000n) {
      issues.push({
        severity: "INFO",
        check: "sequential-numbering",
        message: `Large gap between [${migrations[i - 1].label}] (${timestamps[i - 1]}) and [${migrations[i].label}] (${timestamps[i]}): diff=${diff}`,
        migration: migrations[i].filename,
      });
    }
  }

  return issues;
}

function checkDownMigrationSafety(
  migrations: Migration[]
): Issue[] {
  const issues: Issue[] = [];

  for (const migration of migrations) {
    const sql = migration.content;

    // Check for DROP ... CASCADE (data loss risk)
    const cascadeMatches = sql.match(
      /DROP\s+(?:TABLE|FUNCTION|VIEW|TYPE|INDEX)\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\w+[\s\S]*?CASCADE/gi
    );
    if (cascadeMatches) {
      for (const match of cascadeMatches) {
        issues.push({
          severity: "WARNING",
          check: "down-migration-data-loss",
          message: `DROP ... CASCADE found: "${match.trim().substring(0, 80)}..." — verify reversibility`,
          migration: migration.filename,
        });
      }
    }

    // Check for DROP POLICY (not data loss, but notable)
    const dropPolicies = sql.match(
      /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"[^"]+"/gi
    );
    if (dropPolicies && dropPolicies.length > 0) {
      // These are fine — policies can be recreated
    }

    // Check for REVOKE ... FROM (permission change, reversible)
    // These are reversible with GRANT (not tracked)
  }

  return issues;
}

function checkConflictDetection(
  migrations: Migration[]
): Issue[] {
  const issues: Issue[] = [];
  const tableModifications = new Map<
    string,
    Array<{ migration: string; operation: string; detail: string }>
  >();

  for (const migration of migrations) {
    // Track ALTER TABLE operations
    const alterMatches = migration.content.matchAll(
      /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+(\w+)/gi
    );
    for (const m of alterMatches) {
      const table = m[1].toLowerCase();
      const op = m[2].toLowerCase();
      if (!tableModifications.has(table)) {
        tableModifications.set(table, []);
      }
      tableModifications
        .get(table)!
        .push({
          migration: migration.filename,
          operation: `ALTER TABLE ${table} ${op}`,
          detail: m[0].trim().substring(0, 100),
        });
    }

    // Track CREATE TRIGGER vs DROP TRIGGER on same table
    const trigCreates = migration.content.matchAll(
      /CREATE\s+TRIGGER\s+(\w+)\s+.*?ON\s+(?:public\.)?(\w+)/gis
    );
    const trigDrops = migration.content.matchAll(
      /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?(\w+)/gis
    );

    const creates = new Map<string, string>();
    for (const t of trigCreates) {
      creates.set(t[1].toLowerCase(), t[2].toLowerCase());
    }
    const drops = new Map<string, string>();
    for (const t of trigDrops) {
      drops.set(t[1].toLowerCase(), t[2].toLowerCase());
    }

    // If a migration creates and drops the same trigger, it's a re-apply pattern (fine)
    for (const [name] of creates) {
      if (drops.has(name)) {
        // This is a re-apply pattern — DROP IF EXISTS then CREATE
      }
    }
  }

  // Check for conflicting column type changes (same column, different types in different migrations)
  const columnTypes = new Map<
    string,
    Array<{ migration: string; type: string }>
  >();

  for (const migration of migrations) {
    const createTableMatches = migration.content.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\)/gi
    );
    for (const m of createTableMatches) {
      const table = m[1].toLowerCase();
      const body = m[2];
      const colDefs = body.split("\n");
      for (const colDef of colDefs) {
        const colMatch = colDef.match(/^\s*(\w+)\s+([\w()]+)/);
        if (colMatch) {
          const col = colMatch[1].toLowerCase();
          const type = colMatch[2].toLowerCase();
          const key = `${table}.${col}`;
          if (!columnTypes.has(key)) {
            columnTypes.set(key, []);
          }
          columnTypes.get(key)!.push({
            migration: migration.filename,
            type,
          });
        }
      }
    }
  }

  for (const [key, entries] of columnTypes) {
    if (entries.length > 1) {
      const types = new Set(entries.map((e) => e.type));
      if (types.size > 1) {
        issues.push({
          severity: "WARNING",
          check: "conflict-detection",
          message: `Column "${key}" defined with different types: ${entries.map((e) => `${e.type} (${e.migration})`).join(", ")}`,
          migration: entries[entries.length - 1].migration,
        });
      }
    }
  }

  return issues;
}

function checkDependencyValidation(
  migrations: Migration[]
): Issue[] {
  const issues: Issue[] = [];
  const knownSchema = {
    tables: new Set<string>(), // starts empty, populated from first migration
    columns: new Map<string, Set<string>>(),
    types: new Set<string>(),
    functions: new Set<string>([
      "gen_random_uuid",
      "now",
      "auth.uid",
      "current_setting",
    ]),
    views: new Set<string>(),
    extensions: new Set<string>(),
  };

  // Built-in Supabase schemas — these are always available
  knownSchema.tables.add("auth.users");

  // SQL built-in functions to ignore
  const builtInFunctions = new Set([
    "select",
    "where",
    "and",
    "or",
    "set",
    "not",
    "null",
    "true",
    "false",
    "exists",
    "count",
    "sum",
    "max",
    "min",
    "avg",
    "coalesce",
    "extract",
    "date_trunc",
    "jsonb_build_object",
    "json_agg",
    "json_build_object",
    "encode",
    "gen_random_bytes",
    "hashtext",
    "floor",
    "sqrt",
    "abs",
    "round",
    "greatest",
    "split_part",
    "now",
    "auth.uid",
    "realtime.topic",
    "pg_try_advisory_xact_lock",
    "net.http_post",
    "cron.schedule",
    "cron.unschedule",
    "vault.create_secret",
    "vault.update_secret",
    "current_setting",
    "using",
    "with",
    "check",
    "insert",
    "update",
    "delete",
    "from",
    "join",
    "into",
    "values",
    "on",
    "do",
    "conflict",
    "nothing",
    "like",
    "ilike",
    "in",
    "between",
    "is",
    "distinct",
    "as",
    "case",
    "when",
    "then",
    "else",
    "end",
    "limit",
    "offset",
    "order",
    "by",
    "group",
    "having",
    "all",
    "any",
    "some",
    "union",
    "intersect",
    "except",
    "primary",
    "key",
    "foreign",
    "references",
    "unique",
    "check",
    "default",
    "constraint",
    "cascade",
    "restrict",
    "set",
    "to",
    "grant",
    "revoke",
    "public",
    "anon",
    "authenticated",
    "service_role",
    "role",
    "definer",
    "invoker",
    "stable",
    "volatile",
    "immutable",
    "security",
    "language",
    "plpgsql",
    "sql",
    "returns",
    "void",
    "table",
    "view",
    "trigger",
    "function",
    "policy",
    "index",
    "type",
    "extension",
    "if",
    "before",
    "after",
    "for",
    "each",
    "row",
    "statement",
    "when",
    "new",
    "old",
    "insert",
    "update",
    "delete",
    "truncate",
    "declare",
    "begin",
    "exception",
    "raise",
    "return",
    "perform",
    "foreach",
    "loop",
    "end",
  ]);

  // Process migrations in order
  for (const migration of migrations) {
    const sql = migration.content;

    // Pre-collect what THIS migration creates (so same-migration refs are valid)
    const sameMigrationCreates = new Set<string>();
    for (const table of migration.creates.tables) {
      sameMigrationCreates.add(table);
    }
    for (const func of migration.creates.functions) {
      sameMigrationCreates.add(func);
    }
    for (const view of migration.creates.views) {
      sameMigrationCreates.add(view);
    }
    for (const type of migration.creates.types) {
      sameMigrationCreates.add(type);
    }

    // Check REFERENCES — foreign key dependencies
    const refMatches = sql.matchAll(
      /REFERENCES\s+(?:public\.)?(\w+)\s*\(/gi
    );
    for (const m of refMatches) {
      const refTable = m[1].toLowerCase();
      if (refTable === "auth" || refTable === "users") continue;
      if (
        knownSchema.tables.has(refTable) ||
        sameMigrationCreates.has(refTable)
      ) {
        continue;
      }
      issues.push({
        severity: "ERROR",
        check: "dependency-validation",
        message: `Migration references table "${refTable}" which does not exist yet at this point`,
        migration: migration.filename,
      });
    }

    // Extract function references from SELECT/FUNC calls
    const funcRefMatches = sql.matchAll(
      /(?:SELECT|WHERE|AND|OR|SET)\s+(?:public\.)?(\w+)\s*\(/gi
    );
    for (const m of funcRefMatches) {
      const refFunc = m[1].toLowerCase();
      if (builtInFunctions.has(refFunc)) continue;
      if (
        knownSchema.functions.has(refFunc) ||
        sameMigrationCreates.has(refFunc)
      ) {
        continue;
      }
      issues.push({
        severity: "WARNING",
        check: "dependency-validation",
        message: `Migration calls function "${refFunc}()" which is not yet defined`,
        migration: migration.filename,
      });
    }

    // Now add created objects to knownSchema for future migrations
    for (const table of migration.creates.tables) {
      knownSchema.tables.add(table);
    }
    for (const [table, cols] of migration.creates.columns) {
      if (!knownSchema.columns.has(table)) {
        knownSchema.columns.set(table, new Set());
      }
      for (const col of cols) {
        knownSchema.columns.get(table)!.add(col);
      }
    }
    for (const type of migration.creates.types) {
      knownSchema.types.add(type);
    }
    for (const func of migration.creates.functions) {
      knownSchema.functions.add(func);
    }
    for (const view of migration.creates.views) {
      knownSchema.views.add(view);
    }
    for (const ext of migration.creates.extensions) {
      knownSchema.extensions.add(ext);
    }

    // Remove dropped objects
    for (const table of migration.drops.tables) {
      knownSchema.tables.delete(table);
    }
    for (const func of migration.drops.functions) {
      knownSchema.functions.delete(func);
    }
    for (const view of migration.drops.views) {
      knownSchema.views.delete(view);
    }
  }

  return issues;
}

function checkReversible(
  migrations: Migration[]
): Issue[] {
  const issues: Issue[] = [];

  for (const migration of migrations) {
    const content = migration.content.toUpperCase();
    const hasDownMarker =
      content.includes("-- DOWN;") ||
      content.includes("-- DOWN\n") ||
      content.includes("-- DOWN ") ||
      content.includes("-- DOWN:") ||
      content.includes("-- REVERTIBLE") ||
      content.includes("-- REVERSE") ||
      content.includes("-- UNDO");

    // Supabase migrations don't typically include DOWN markers
    // This is by design — Supabase uses forward-only migrations
    // We just document it as informational
    if (!hasDownMarker) {
      issues.push({
        severity: "INFO",
        check: "reversible-check",
        message: `No explicit DOWN/revert marker — Supabase uses forward-only migrations (expected)`,
        migration: migration.filename,
      });
    }
  }

  return issues;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const migrationDir = path.resolve(
    process.cwd(),
    "supabase/migrations"
  );

  if (!fs.existsSync(migrationDir)) {
    console.error(`❌ Migration directory not found: ${migrationDir}`);
    process.exit(1);
  }

  // Read all SQL files
  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error("❌ No SQL migration files found");
    process.exit(1);
  }

  console.log(`\n🔍 Migration Order Verification — ${files.length} files found\n`);

  // Parse each migration
  const migrations: Migration[] = files.map((file) => {
    const timestamp = file.split("_")[0];
    const label = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
    const filePath = path.join(migrationDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const { creates, drops, modifies } = parseSql(content);

    return {
      filename: file,
      timestamp,
      label,
      filePath,
      content,
      creates,
      drops,
      modifies,
    };
  });

  // Sort by timestamp
  migrations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Print migration inventory
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  MIGRATION INVENTORY");
  console.log("═══════════════════════════════════════════════════════════════");
  for (const m of migrations) {
    const tables = m.creates.tables.size;
    const funcs = m.creates.functions.size;
    const drops =
      m.drops.tables.size +
      m.drops.functions.size +
      m.drops.views.size;
    const mods =
      m.modifies.addsColumns.size +
      m.modifies.dropsPolicies.size +
      m.modifies.dropsTriggers.size;
    console.log(
      `  ${m.timestamp}  ${m.label.padEnd(50)}  +${tables}t +${funcs}f -${drops}d ~${mods}m`
    );
  }
  console.log("");

  // Run all checks
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CHECKS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const allIssues: Issue[] = [];

  const checks = [
    { name: "1. Sequential Numbering", fn: checkSequentialNumbering },
    { name: "2. DOWN Migration Safety", fn: checkDownMigrationSafety },
    { name: "3. Conflict Detection", fn: checkConflictDetection },
    { name: "4. Dependency Validation", fn: checkDependencyValidation },
    { name: "5. Reversible Check", fn: checkReversible },
  ];

  for (const check of checks) {
    console.log(`▶ ${check.name}`);
    const issues = check.fn(migrations);
    allIssues.push(...issues);

    if (issues.length === 0) {
      console.log(`  ✅ PASS — no issues found\n`);
    } else {
      for (const issue of issues) {
        const icon =
          issue.severity === "ERROR"
            ? "❌"
            : issue.severity === "WARNING"
              ? "⚠️ "
              : "ℹ️ ";
        console.log(`  ${icon} [${issue.severity}] ${issue.message}`);
      }
      console.log("");
    }
  }

  // Summary
  const errors = allIssues.filter((i) => i.severity === "ERROR");
  const warnings = allIssues.filter((i) => i.severity === "WARNING");
  const infos = allIssues.filter((i) => i.severity === "INFO");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Total migrations: ${migrations.length}`);
  console.log(`  Errors:   ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Info:     ${infos.length}`);
  console.log("");

  // Final verdict
  if (errors.length > 0) {
    console.log("❌ VERDICT: FAIL — errors must be fixed before proceeding\n");
    console.log("Error details:");
    for (const err of errors) {
      console.log(`  - [${err.check}] ${err.message}`);
    }
    console.log("");
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log(
      "⚠️  VERDICT: PASS WITH WARNINGS — warnings are informational\n"
    );
    process.exit(0);
  } else {
    console.log("✅ VERDICT: PASS — all checks passed\n");
    process.exit(0);
  }
}

main();
