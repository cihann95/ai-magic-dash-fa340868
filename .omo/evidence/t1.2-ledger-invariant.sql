-- =============================================================
-- T1.2 — settlement_ledger Invariant Control
-- Date: 2026-06-15
-- Scope: SQL-only with test data (no production, no Supabase)
--
-- INVARIANT: pot_total = prize_amount + fee_collected
--            (per-row and per-room aggregate)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Create settlement_ledger table (SQLite-compatible)
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS settlement_ledger;

CREATE TABLE settlement_ledger (
  id                TEXT PRIMARY KEY,
  room_id           TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE,
  settlement_type   TEXT NOT NULL CHECK (settlement_type IN ('edge_function', 'db_trigger', 'cron')),
  winner_id         TEXT,
  prize_amount      NUMERIC NOT NULL CHECK (prize_amount >= 0),
  fee_collected     NUMERIC NOT NULL CHECK (fee_collected >= 0),
  pot_total         NUMERIC NOT NULL CHECK (pot_total >= 0),
  participant_count  INTEGER NOT NULL CHECK (participant_count > 0),
  status            TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'rolled_back')),
  created_at        TEXT DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Insert test data
--
-- Scenario A: 3 completed settlements in room-1 — ALL VALID
--   pot_total == prize_amount + fee_collected exactly
--
-- Scenario B: 2 completed settlements in room-2 — ALL VALID
--
-- Scenario C: 3 completed settlements in room-3 — 1 DRIFTED
--   row-7: pot_total=100, prize+fee=110 → drift = -10
--
-- Scenario D: 2 completed settlements in room-4 — 1 DRIFTED
--   row-9: pot_total=50, prize+fee=45  → drift = +5
--
-- Plus: 1 failed row (should be excluded from checks)
-- Plus: 1 rolled_back row (should be excluded from checks)
-- ─────────────────────────────────────────────────────────────

INSERT INTO settlement_ledger VALUES
  -- Room 1: valid completed settlements
  ('a1000000-0000-0000-0000-000000000001', 'r1000000-0000-0000-0000-000000000001',
   'r1:edge_function', 'edge_function', 'u1000000-0000-0000-0000-000000000001',
   80, 20, 100, 5, 'completed'),
  ('a1000000-0000-0000-0000-000000000002', 'r1000000-0000-0000-0000-000000000001',
   'r1:db_trigger', 'db_trigger', 'u1000000-0000-0000-0000-000000000002',
   150, 30, 180, 8, 'completed'),
  ('a1000000-0000-0000-0000-000000000003', 'r1000000-0000-0000-0000-000000000001',
   'r1:cron', 'cron', 'u1000000-0000-0000-0000-000000000003',
   50, 10, 60, 3, 'completed'),

  -- Room 2: valid completed settlements
  ('a2000000-0000-0000-0000-000000000001', 'r2000000-0000-0000-0000-000000000001',
   'r2:edge_function', 'edge_function', 'u2000000-0000-0000-0000-000000000001',
   200, 50, 250, 10, 'completed'),
  ('a2000000-0000-0000-0000-000000000002', 'r2000000-0000-0000-0000-000000000001',
   'r2:cron', 'cron', 'u2000000-0000-0000-0000-000000000002',
   100, 25, 125, 6, 'completed'),

  -- Room 3: 2 valid + 1 DRIFTED (pot_total=100, prize+fee=110 → drift=-10)
  ('a3000000-0000-0000-0000-000000000001', 'r3000000-0000-0000-0000-000000000001',
   'r3:edge_function', 'edge_function', 'u3000000-0000-0000-0000-000000000001',
   70, 10, 80, 4, 'completed'),
  ('a3000000-0000-0000-0000-000000000002', 'r3000000-0000-0000-0000-000000000001',
   'r3:db_trigger', 'db_trigger', 'u3000000-0000-0000-0000-000000000002',
   60, 10, 70, 3, 'completed'),
  ('a3000000-0000-0000-0000-000000000003', 'r3000000-0000-0000-0000-000000000001',
   'r3:cron', 'cron', 'u3000000-0000-0000-0000-000000000003',
   60, 50, 100, 2, 'completed'),  -- DRIFT: 60+50=110 ≠ 100

  -- Room 4: 1 valid + 1 DRIFTED (pot_total=50, prize+fee=45 → drift=+5)
  ('a4000000-0000-0000-0000-000000000001', 'r4000000-0000-0000-0000-000000000001',
   'r4:edge_function', 'edge_function', 'u4000000-0000-0000-0000-000000000001',
   40, 10, 50, 5, 'completed'),
  ('a4000000-0000-0000-0000-000000000002', 'r4000000-0000-0000-0000-000000000001',
   'r4:db_trigger', 'db_trigger', 'u4000000-0000-0000-0000-000000000002',
   25, 20, 50, 3, 'completed'),  -- DRIFT: 25+20=45 ≠ 50

  -- Non-completed rows (excluded from invariant checks)
  ('a5000000-0000-0000-0000-000000000001', 'r1000000-0000-0000-0000-000000000001',
   'r1:failed1', 'edge_function', 'u1000000-0000-0000-0000-000000000001',
   0, 0, 0, 2, 'failed'),
  ('a5000000-0000-0000-0000-000000000002', 'r2000000-0000-0000-0000-000000000001',
   'r2:rolled_back1', 'cron', 'u2000000-0000-0000-0000-000000000001',
   0, 0, 0, 4, 'rolled_back');


-- =============================================================
-- STEP 3: INVARIANT CHECK 1 — Row-level
-- Find any completed row where pot_total ≠ prize_amount + fee_collected
-- =============================================================
SELECT '--- CHECK 1: ROW-LEVEL INVARIANT (pot_total = prize + fee) ---' AS '';

SELECT
  id AS settlement_id,
  room_id,
  pot_total,
  prize_amount + fee_collected AS expected_pot,
  pot_total - (prize_amount + fee_collected) AS drift
FROM settlement_ledger
WHERE status = 'completed'
  AND ABS(pot_total - (prize_amount + fee_collected)) > 0.0001;

SELECT '--- CHECK 1 COMPLETE ---' AS '';


-- =============================================================
-- STEP 4: INVARIANT CHECK 2 — Room-level aggregate
-- Sum across all completed settlements per room
-- =============================================================
SELECT '--- CHECK 2: ROOM-LEVEL AGGREGATE INVARIANT ---' AS '';

SELECT
  room_id,
  COUNT(*) AS completed_count,
  SUM(pot_total) AS total_pot,
  SUM(prize_amount) AS total_prize,
  SUM(fee_collected) AS total_fee,
  SUM(prize_amount) + SUM(fee_collected) AS expected_total_pot,
  SUM(pot_total) - (SUM(prize_amount) + SUM(fee_collected)) AS aggregate_drift
FROM settlement_ledger
WHERE status = 'completed'
GROUP BY room_id
HAVING ABS(SUM(pot_total) - (SUM(prize_amount) + SUM(fee_collected))) > 0.0001;

SELECT '--- CHECK 2 COMPLETE ---' AS '';


-- =============================================================
-- STEP 5: Summary — count of drifted vs clean rows
-- =============================================================
SELECT '--- SUMMARY ---' AS '';

SELECT
  COUNT(*) AS total_completed,
  SUM(CASE WHEN ABS(pot_total - (prize_amount + fee_collected)) > 0.0001 THEN 1 ELSE 0 END) AS drifted_rows,
  SUM(CASE WHEN ABS(pot_total - (prize_amount + fee_collected)) <= 0.0001 THEN 1 ELSE 0 END) AS clean_rows
FROM settlement_ledger
WHERE status = 'completed';


-- =============================================================
-- EXECUTION RESULTS (bun:sqlite, 2026-06-15)
-- =============================================================
--
-- CHECK 1: ROW-LEVEL INVARIANT
--   ✗ 2 ROW(S) WITH DRIFT:
--     a3000000-0000-0000-0000-000000000003 | room=r3 | pot=100 expected=110 drift=-10
--     a4000000-0000-0000-0000-000000000002 | room=r4 | pot=50  expected=45  drift=+5
--
-- CHECK 2: ROOM-LEVEL AGGREGATE INVARIANT
--   ✗ 2 ROOM(S) WITH AGGREGATE DRIFT:
--     room=r3 | pot=250 prize=190 fee=70 drift=-10
--     room=r4 | pot=100 prize=65 fee=30 drift=+5
--
-- SUMMARY:
--   Total completed: 10
--   Clean rows:      8
--   Drifted rows:    2
--
-- ALL COMPLETED ROWS:
--   a1-1 | r1 | edge_function  | prize= 80 fee= 20 pot=100 drift=   0 ✓
--   a1-2 | r1 | db_trigger     | prize=150 fee= 30 pot=180 drift=   0 ✓
--   a1-3 | r1 | cron           | prize= 50 fee= 10 pot= 60 drift=   0 ✓
--   a2-1 | r2 | edge_function  | prize=200 fee= 50 pot=250 drift=   0 ✓
--   a2-2 | r2 | cron           | prize=100 fee= 25 pot=125 drift=   0 ✓
--   a3-1 | r3 | edge_function  | prize= 70 fee= 10 pot= 80 drift=   0 ✓
--   a3-2 | r3 | db_trigger     | prize= 60 fee= 10 pot= 70 drift=   0 ✓
--   a3-3 | r3 | cron           | prize= 60 fee= 50 pot=100 drift= -10 ← DRIFT
--   a4-1 | r4 | edge_function  | prize= 40 fee= 10 pot= 50 drift=   0 ✓
--   a4-2 | r4 | db_trigger     | prize= 25 fee= 20 pot= 50 drift=  +5 ← DRIFT
--
-- TEST DATA SCHEMA:
--   Room r1: 3 completed (all valid) + 1 failed
--   Room r2: 2 completed (all valid) + 1 rolled_back
--   Room r3: 2 valid + 1 DRIFTED (pot=100, prize+fee=110, drift=-10)
--   Room r4: 1 valid + 1 DRIFTED (pot=50, prize+fee=45, drift=+5)
--
-- =============================================================
-- CONCLUSION
-- =============================================================
-- The invariant pot_total = prize_amount + fee_collected can be
-- violated at both row and room level. The SQL queries above are
-- effective at detecting such drifts.
--
-- Key observations:
-- 1. Row-level check catches per-settlement imbalances immediately
-- 2. Room-level check catches aggregate drift (net pot mismatch)
-- 3. Both failed and rolled_back rows are correctly excluded
-- 4. The CHECK constraints on the table ensure non-negative values
--    but do NOT enforce the pot_total = prize + fee relationship
--
-- RECOMMENDATION: Add a CHECK or EXCLUDE constraint on the table
-- definition to enforce pot_total = prize_amount + fee_collected
-- at write time, or add a trigger-based validation.
