# Production Hardening — Issues

## 2026-06-15 — Wave 0-4 Issues

### T0.3 - CI Workflow Reverted
- **Issue**: GitHub Actions workflow reverted due to OAuth scope issues
- **Impact**: CI pipeline not running, no automated testing
- **Resolution**: T2.1 will fix and re-enable CI workflow

### T1.3 - Migration Dependencies
- **Issue**: Migration `20260610000006` adds `closed_at` column
- **Impact**: Must run before other migrations that reference this column
- **Resolution**: Already applied in dev, needs staging/production deployment

### T3.2 - Type Extension Maintenance
- **Issue**: `types.extra.ts` is manual, may drift from auto-generated types
- **Impact**: Future Supabase schema changes may break types
- **Resolution**: T5.5 will add sync check script

### T4.1 - Rate Limit Configuration
- **Issue**: Rate limits hardcoded in edge functions
- **Impact**: Changes require code update + redeployment
- **Resolution**: Consider environment variables for dynamic configuration

### T4.2 - Zod Input Validation Added
- **Issue**: AI edge functions accepted arbitrary input
- **Impact**: High - potential for injection attacks
- **Resolution**: Zod validation added to all 5 AI functions, test files created
- **Status**: COMPLETED (task timed out but implementation finished)

### T5.2 - Lint Errors Fixed
- **Issue**: Unused imports in `useAnaSahne.ts`
- **Impact**: Low - code quality
- **Resolution**: Unused imports removed, ESLint passes with 0 errors
- **Status**: COMPLETED

### T5.6 - Page Tests Partially Written
- **Issue**: Only Portfolio.test.tsx created, missing Settings, Blitz, Index tests
- **Impact**: Medium - incomplete regression protection
- **Status**: PARTIAL COMPLETED - needs remaining 3 page tests

### Known Limitations
1. **No CD pipeline**: Only CI exists, deployment is manual
2. **No staging environment**: Using production for testing (risky)
3. **CORS wildcard**: All functions use `Access-Control-Allow-Origin: *`
4. **Mock services**: Sentry, Redis may be mock in development

### Technical Debt
- `as any` casts eliminated but type extension file needs maintenance
- Rate limits may need tuning based on production traffic
- Test coverage unknown until T5.4 runs coverage report
