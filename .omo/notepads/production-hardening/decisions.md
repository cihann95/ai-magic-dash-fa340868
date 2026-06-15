# Production Hardening — Decisions

## 2026-06-15 — Wave 0-4 Architectural Decisions

### Race Condition Strategy
- **Decision**: Use optimistic locking with `closed_at` timestamp
- **Rationale**: Edge Functions are stateless, row-level locks don't persist across invocations
- **Alternative Considered**: Distributed locks (Redis) - rejected due to complexity

### Rate Limiting Algorithm
- **Decision**: Sliding window with Redis sorted sets
- **Rationale**: Better UX than fixed window, prevents burst at window edges
- **Alternative Considered**: Token bucket - rejected due to Redis implementation complexity

### Type Safety Approach
- **Decision**: Type extension file instead of modifying auto-generated types
- **Rationale**: Supabase CLI regenerates `types.ts`, manual edits would be lost
- **Alternative Considered**: Post-generation script - rejected due to maintenance burden

### Test Organization
- **Decision**: Centralized `__tests__/` directory for edge functions
- **Rationale**: Tests are integration tests, not unit tests; shared mock server
- **Alternative Considered**: Colocated tests - rejected due to mock server dependencies

### Ledger Invariant Enforcement
- **Decision**: Database trigger with `RAISE EXCEPTION`
- **Rationale**: Invariant must be enforced at database level, not application level
- **Alternative Considered**: Application-level check - rejected due to race conditions

### Fail-Open Pattern
- **Decision**: Allow requests when Redis/rate limiting unavailable
- **Rationale**: Availability over strict security for demo platform
- **Alternative Considered**: Fail-closed - rejected due to user experience impact

### Migration Strategy
- **Decision**: Sequential numbering with descriptive names
- **Rationale**: Clear dependency tracking, easy rollback
- **Alternative Considered**: Timestamp-only naming - rejected due to readability

### Evidence Collection
- **Decision**: Centralized `.omo/evidence/` with task-specific files
- **Rationale**: Audit trail for production readiness verification
- **Alternative Considered**: Inline documentation - rejected due to discoverability

### Code Review Approach
- **Decision**: LSP diagnostics + manual review for each task
- **Rationale**: Automated checks catch syntax, manual review catches logic
- **Alternative Considered**: Automated-only - rejected due to false positives

### Deployment Strategy
- **Decision**: Staging environment before production
- **Rationale**: Validate changes in production-like environment
- **Alternative Considered**: Direct production - rejected due to risk
