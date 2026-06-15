# CI Pipeline Setup — GitHub Actions Crash-Test Gatekeeper

## TL;DR

> **Quick Summary**: Create a zero-trust GitHub Actions CI workflow that runs the 3 crash-test scripts (CRSH-001/002/003) against the mock server on every push/PR to main branches, blocking merges on any failure.
>
> **Deliverables**:
> - `.github/workflows/ci.yml` — GitHub Actions workflow file
>
> **Estimated Effort**: Quick (~15 min)
> **Parallel Execution**: NO — single task, single file
> **Critical Path**: Task 1 (only task)

---

## Context

### Original Request
Wire up a free, lightweight GitHub Actions CI pipeline to institutionalize the crash-test quality gate. The pipeline must run all 3 crash-test scripts (CRSH-001/002/003) against the local mock server infrastructure (`_mock_server.ts`), with zero-trust fail behavior — any non-zero exit blocks merge.

### Interview Summary
**Key Discussions**:
- User explicitly defined 3 tasks in the prompt (workflow creation, step configuration, gatekeeper constraints)
- All requirements are fully specified — no interview needed, direct to planning

**Research Findings**:
- `denoland/setup-deno@v2` supports `deno-version` input for pinning to v2.8.2
- `actions/checkout@v4` is the latest major version
- No existing `.github/workflows/` directory — fresh creation
- Remote deps (`esm.sh/@supabase/supabase-js@2.45.0`, `jsr:@std/fs@1`) require internet in CI
- `_run_all.ts` auto-starts mock server, runs 3 scripts, aggregates exit codes, captures evidence

### Metis Review
**Identified Gaps** (addressed in plan):
- **`--frozen` flag**: Added to `deno run` command for lock-file integrity (supply-chain security)
- **Workflow naming**: Named `crash-test` for GitHub branch protection compatibility
- **Concurrency control**: Added `concurrency` with `cancel-in-progress: true` to avoid wasted runs
- **Timeout**: Set `timeout-minutes: 10` (adequate for ~30-45s test suite)
- **Paths filtering**: Added `paths-ignore` for docs/meta files to avoid unnecessary CI triggers
- **`--no-prompt`**: Added to prevent CI hangs if Deno prompts for stdin

---

## Work Objectives

### Core Objective
Create a single GitHub Actions workflow file (`.github/workflows/ci.yml`) that automatically runs the hard-technical-audit crash-test suite on every push and pull_request targeting `main`, and fails the pipeline if any test exits non-zero.

### Concrete Deliverables
- `.github/workflows/ci.yml` — flat, single-job workflow file

### Definition of Done
- [ ] `ls .github/workflows/ci.yml` → file exists
- [ ] `yamllint .github/workflows/ci.yml` → no syntax errors
- [ ] Workflow name parsed as `crash-test`
- [ ] Deno version pinned to `2.8.2`
- [ ] `--frozen` flag present in deno run command
- [ ] `concurrency` block present with `cancel-in-progress: true`
- [ ] `timeout-minutes` set to 10

### Must Have
- [ ] GitHub Actions workflow at `.github/workflows/ci.yml`
- [ ] Trigger on `push` and `pull_request` to `main` branch
- [ ] Ubuntu latest runner image (`ubuntu-latest`)
- [ ] Source checkout via `actions/checkout@v4`
- [ ] Deno installation via `denoland/setup-deno@v2`, pinned to `2.8.2`
- [ ] Crash-test execution via `deno run --frozen --no-prompt -A scripts/audit/_run_all.ts`
- [ ] Zero-trust fail: non-zero exit code fails the pipeline
- [ ] No hardcoded secrets — mock server handles all auth internally

### Must NOT Have (Guardrails)
- [ ] NO CD/deployment pipeline or webhook integrations
- [ ] NO matrix builds (single Deno version only)
- [ ] NO Dependabot or dependency update automation
- [ ] NO linting/formatting/type-checking steps
- [ ] NO PR comments or GitHub API interactions
- [ ] NO composite actions or shared workflow templates
- [ ] NO modifications to `scripts/`, `src/`, or any existing files
- [ ] NO `continue-on-error: true` — pipeline must stop on failure

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: N/A (infrastructure workflow)
- **Automated tests**: N/A (no business logic to unit test)
- **Agent QA**: YAML file verification via grep + yamllint

### QA Policy
The single task includes agent-executable acceptance criteria:
- `glob` to verify file existence
- `Read` to parse YAML content
- `grep` to verify specific directives (`--frozen`, `deno-version: "2.8.2"`, etc.)
- `bash yamllint` to verify YAML syntax
- No human-in-the-loop verification required

---

## Execution Strategy

### Parallel Execution Waves

Since this is a single-file creation, there is only 1 task in 1 wave.

```
Wave 1 (Start Immediately):
└── Task 1: Create .github/workflows/ci.yml [quick]

Wave FINAL (After Task 1):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: YAML syntax + correctness review (unspecified-high)
├── Task F3: Real QA — parse workflow YAML, verify all directives (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1**: None → F1, F2, F3, F4

### Agent Dispatch Summary
- **Wave 1**: **1** — Task 1 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `.github/workflows/ci.yml` — crash-test CI workflow

  **What to do**:
  - Create the directory `.github/workflows/` if it does not exist
  - Create `ci.yml` with the following structure:

  ```yaml
  name: crash-test
  on:
    push:
      branches: [main]
      paths-ignore:
        - "*.md"
        - "*.txt"
        - LICENSE
        - .gitignore
        - .env.example
    pull_request:
      branches: [main]
      paths-ignore:
        - "*.md"
        - "*.txt"
        - LICENSE
        - .gitignore
        - .env.example

  concurrency:
    group: ${{ github.ref }}
    cancel-in-progress: true

  jobs:
    crash-test:
      runs-on: ubuntu-latest
      timeout-minutes: 10
      steps:
        - uses: actions/checkout@v4
        - uses: denoland/setup-deno@v2
          with:
            deno-version: "2.8.2"
        - run: deno run --frozen --no-prompt -A scripts/audit/_run_all.ts
  ```

  **Must NOT do**:
  - Do NOT add any steps beyond checkout → setup-deno → run tests
  - Do NOT use `continue-on-error: true`
  - Do NOT add secrets or environment variable references
  - Do NOT modify any file under `scripts/` or `src/`
  - Do NOT add matrix builds or extra validation steps

  **Recommended Agent Profile**:
  > Quick task — single YAML file creation with well-defined structure
  - **Category**: `quick`
    - Reason: Single file creation with explicit template to follow
  - **Skills**: none needed
    - Straightforward YAML file, no complex logic

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task)
  - **Parallel Group**: N/A
  - **Blocks**: All F-tasks
  - **Blocked By**: None (can start immediately)

  **References**:
  - `scripts/audit/_run_all.ts` — The runner script that this CI workflow executes
  - `scripts/audit/_mock_server.ts` — Mock server infrastructure (auto-started by `_run_all.ts`)
  - Official GitHub Actions docs: `https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions`
  - `denoland/setup-deno@v2` usage: `https://github.com/denoland/setup-deno`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify workflow file exists and has correct syntax
    Tool: Bash (glob + yamllint)
    Preconditions: .github/workflows/ci.yml has been created
    Steps:
      1. ls .github/workflows/ci.yml → must succeed (file exists)
      2. yamllint .github/workflows/ci.yml → must exit 0 (no syntax errors)
    Expected Result: File exists and parses as valid YAML
    Failure Indicators: File not found, yamllint reports errors
    Evidence: .omo/evidence/ci-pipeline/file-exists.txt, .omo/evidence/ci-pipeline/yamllint.txt

  Scenario: Verify workflow name is "crash-test"
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -q '^name: crash-test' .github/workflows/ci.yml
    Expected Result: Exit 0 — name matches
    Evidence: .omo/evidence/ci-pipeline/workflow-name.txt

  Scenario: Verify Deno version is pinned to 2.8.2
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -q "deno-version: \"2.8.2\"" .github/workflows/ci.yml
    Expected Result: Exit 0 — version pinned
    Evidence: .omo/evidence/ci-pipeline/deno-version.txt

  Scenario: Verify --frozen flag is present in run command
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -q -- '--frozen' .github/workflows/ci.yml
    Expected Result: Exit 0 — frozen flag present
    Evidence: .omo/evidence/ci-pipeline/frozen-flag.txt

  Scenario: Verify concurrency block with cancel-in-progress
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -q 'cancel-in-progress: true' .github/workflows/ci.yml
    Expected Result: Exit 0 — concurrency configured
    Evidence: .omo/evidence/ci-pipeline/concurrency.txt

  Scenario: Verify timeout-minutes is set
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -q 'timeout-minutes: 10' .github/workflows/ci.yml
    Expected Result: Exit 0 — timeout configured
    Evidence: .omo/evidence/ci-pipeline/timeout.txt

  Scenario: Verify push triggers on main branch
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -qA3 'push:' .github/workflows/ci.yml | grep -q 'branches: \[main\]'
    Expected Result: Exit 0 — push trigger targets main
    Evidence: .omo/evidence/ci-pipeline/push-trigger.txt

  Scenario: Verify no secrets or env vars with live credentials
    Tool: Bash (grep)
    Preconditions: YAML file exists
    Steps:
      1. grep -qiE '(supabase_url|upstash_url|api_key|secret|password|token)' .github/workflows/ci.yml
    Expected Result: Exit 1 (no matches — no secrets leaked)
    Evidence: .omo/evidence/ci-pipeline/no-secrets.txt
  ```

  **Evidence to Capture:**
  - [ ] `.omo/evidence/ci-pipeline/file-exists.txt`
  - [ ] `.omo/evidence/ci-pipeline/yamllint.txt`
  - [ ] `.omo/evidence/ci-pipeline/workflow-name.txt`
  - [ ] `.omo/evidence/ci-pipeline/deno-version.txt`
  - [ ] `.omo/evidence/ci-pipeline/frozen-flag.txt`
  - [ ] `.omo/evidence/ci-pipeline/concurrency.txt`
  - [ ] `.omo/evidence/ci-pipeline/timeout.txt`
  - [ ] `.omo/evidence/ci-pipeline/push-trigger.txt`
  - [ ] `.omo/evidence/ci-pipeline/no-secrets.txt`

  **Commit**: YES
  - Message: `ci(crash-test): add GitHub Actions workflow for automated crash-test gatekeeper`
  - Files: `.github/workflows/ci.yml`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read `.omo/plans/ci-pipeline-setup.md` end-to-end. For each "Must Have": verify implementation exists (read file, grep for directives). For each "Must NOT Have": search generated YAML for forbidden patterns — reject with file:line if found. Check evidence files exist in `.omo/evidence/ci-pipeline/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **YAML Syntax + Correctness Review** — `unspecified-high`
  Run `yamllint .github/workflows/ci.yml`. Read the YAML file and verify: workflow name is `crash-test`, job name is `crash-test`, all 3 steps present in correct order, no extra steps, no `continue-on-error: true`, no secrets references.
  Output: `yamllint [PASS/FAIL] | Checks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F3. **Real QA — Directive Verification** — `unspecified-high`
  Execute EVERY QA scenario from Task 1. Run each grep/check command, capture evidence. Verify all 9 evidence files exist.
  Output: `Scenarios [N/N pass] | Evidence [N/N] | VERDICT: APPROVE/REJECT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Read Task 1 "What to do", read actual `.github/workflows/ci.yml`. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Verify no files under `scripts/` or `src/` were modified.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **1**: `ci(crash-test): add GitHub Actions workflow for automated crash-test gatekeeper` — `.github/workflows/ci.yml`

---

## Success Criteria

### Verification Commands
```bash
ls .github/workflows/ci.yml                                       # Expected: file exists
yamllint .github/workflows/ci.yml                                  # Expected: exit 0
grep '^name: crash-test' .github/workflows/ci.yml                  # Expected: match
grep 'deno-version: "2.8.2"' .github/workflows/ci.yml              # Expected: match
grep -- '--frozen' .github/workflows/ci.yml                        # Expected: match
grep 'cancel-in-progress: true' .github/workflows/ci.yml           # Expected: match
grep 'timeout-minutes: 10' .github/workflows/ci.yml                # Expected: match
```

### Final Checklist
- [ ] All "Must Have" present in workflow YAML
- [ ] All "Must NOT Have" absent from workflow YAML
- [ ] No files modified outside `.github/workflows/ci.yml`
- [ ] All 9 evidence files captured in `.omo/evidence/ci-pipeline/`
