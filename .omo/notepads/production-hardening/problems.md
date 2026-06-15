# Production Hardening — Problems

## 2026-06-15 — Outstanding Problems

### T2.1 - CI Pipeline Not Running
- **Problem**: GitHub Actions workflow reverted, no automated testing
- **Impact**: High - cannot verify changes automatically
- **Status**: Ready to fix (T0.3 analysis complete, T1.3 fixes applied)
- **Next**: T2.1 will修复 and re-enable workflow

### T2.2 - No Staging Environment
- **Problem**: No dedicated staging Supabase project
- **Impact**: Medium - testing in production environment
- **Status**: Pending T2.1 completion
- **Next**: T2.2 will set up staging using existing project

### T4.2 - No Input Validation
- **Problem**: AI edge functions accept arbitrary input
- **Impact**: High - potential for injection attacks
- **Status**: COMPLETED - Zod validation added to all 5 AI functions
- **Resolution**: Each function now validates request body with Zod schema, returns 400 for invalid input

### T4.3 - Mock Services in Production
- **Problem**: Sentry, Redis may be mock values
- **Impact**: Medium - no monitoring, no rate limiting in prod
- **Status**: Pending T2.2 (staging must work first)
- **Next**: T4.3 will configure production services

### T5.1 - No Documentation
- **Problem**: README.md is placeholder
- **Impact**: Low - developers can't onboard
- **Status**: COMPLETED - comprehensive README.md written (331 lines)

### T5.2 - Lint Errors
- **Problem**: Unused imports in `useAnaSahne.ts`
- **Impact**: Low - code quality
- **Status**: COMPLETED - unused imports removed
- **Resolution**: ESLint now passes with 0 errors

### T5.3 - Large Bundle Size
- **Problem**: Main chunk > 1.3MB (Recharts)
- **Impact**: Medium - slow initial load
- **Status**: COMPLETED - Recharts dynamic import, 1.34MB → 1.02MB (23.8% reduction)

### T5.4 - No Coverage Report
- **Problem**: Unknown test coverage percentage
- **Impact**: Low - can't measure improvement
- **Status**: COMPLETED - vitest coverage configured (v8 provider, 45.18% statements)

### T5.5 - Type Sync Drift Risk
- **Problem**: `types.extra.ts` manual, may drift from auto-generated types
- **Impact**: Medium - future type errors
- **Status**: Pending T2.1 (CI needed for sync check)
- **Next**: T5.5 will add sync check script

### T5.6 - No Page Tests
- **Problem**: Portfolio, Settings, Blitz, Index pages untested
- **Impact**: Medium - no regression protection
- **Status**: PARTIAL - Portfolio.test.tsx fixed and passing (3/3 tests), Settings/Blitz/Index still missing
- **Root causes fixed**: Named vs default import mismatch, vi.mock hoisting with vi.hoisted(), mockReturnThis() in mockImplementation, restoreAllMocks destroying vi.hoisted() implementations, async waitFor targeting static text

### T5.7 - Test File Organization
- **Problem**: Test files scattered, not in `__tests__/`
- **Impact**: Low - code organization
- **Status**: Pending T5.6 (need page tests first)
- **Next**: T5.7 will consolidate test files

### Cross-Cutting Concerns
1. **CORS wildcard**: All functions use `*`, should restrict in production
2. **Error handling**: Inconsistent across edge functions
3. **Logging**: No structured logging for production debugging
4. **Monitoring**: No alerts for rate limiting, errors, performance

### Dependencies
- T2.1 blocks: T2.2, T5.5
- T2.2 blocks: T4.3
- T5.6 blocks: T5.7
- All other tasks are independent

### Risk Assessment
- **High Risk**: T2.1 (CI pipeline) - affects all future changes
- **Medium Risk**: T4.2 (input validation), T4.3 (prod services)
- **Low Risk**: T5.1-T5.4 (documentation, lint, bundle, coverage)
