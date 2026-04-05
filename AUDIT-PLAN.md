# SQL-TS Full Spectrum Audit — Refined Plan

**Date:** 2026-04-05
**Scope:** ~15K LOC, 39 TypeScript files, single-dev MCP server
**Method:** 5 parallel audits (architecture, duplication, TypeScript, security, testing) + devil's advocate review

---

## Executive Summary

The codebase is **solid for its scale** — clean architecture, no circular dependencies, strong SQL injection prevention, good type coverage. The audits surfaced real issues but also inflated several findings to enterprise-grade severity. This plan filters for **changes that actually reduce bugs and improve maintainability**, rejecting architectural tourism.

---

## Tier 1: Bugs & Correctness (Do First)

### 1.1 Duplicate Error Class Hierarchy — REAL BUG RISK
**Files:** `src/types/database.ts:241-286` and `src/utils/error-handler.ts:11-69`
**Problem:** `SQLMCPError`, `SecurityViolationError`, `ConnectionError`, `QueryExecutionError` are defined in **both** files with independent class identities. A `catch (e) { if (e instanceof ConnectionError)` using one import won't match the other.
**Fix:** Delete the 4 classes from `src/types/database.ts`, re-export from `src/utils/error-handler.ts`. Update all imports.
**Effort:** 15 min | **Risk if skipped:** Silent catch misses in error handling

### 1.2 Remove `DOM` from tsconfig lib — SILENT BUG VECTOR
**File:** `tsconfig.json:6`
**Problem:** `"lib": ["ES2022", "ES2015.Iterable", "DOM"]` — a Node.js CLI server should not have DOM types. Code referencing `window`, `document`, `localStorage` will compile without errors.
**Fix:** Remove `"DOM"` from lib array. Fix any compile errors (there shouldn't be any).
**Effort:** 5 min | **Risk if skipped:** Accidental browser API usage compiles silently

### 1.3 Delete Unused Utility Methods
**File:** `src/database/adapters/base.ts:280-304`
**Problem:** `getSafeString()`, `getSafeNumber()`, `getSafeBoolean()` defined but never called anywhere.
**Fix:** Delete the 3 methods.
**Effort:** 5 min | **Risk if skipped:** Low, but dead code is confusing

---

## Tier 2: Security Hardening (Do Second)

### 2.1 Make SSL Certificate Verification Configurable
**Files:** `src/database/adapters/mysql.ts:42,51`, `postgresql.ts:41`, `mssql.ts:39`
**Problem:** `rejectUnauthorized: false` / `trustServerCertificate: true` hardcoded. While most self-hosted DBs use self-signed certs (making `false` a practical default), users should be able to opt into strict verification.
**Fix:** Add `ssl_verify` option to DatabaseConfig. Default `false` (pragmatic for self-hosted), but configurable per-database. Log a warning when `ssl=true` but `ssl_verify=false`.
**Effort:** 1 hr | **Severity:** Medium (local CLI tool, not public-facing — devil's advocate correctly downgraded from CRITICAL)

---

## Tier 3: Practical Deduplication (Do Third)

These are the duplication findings that survived devil's advocate scrutiny. Rejected items are listed at the bottom with rationale.

### 3.1 Extract `DEFAULT_PORTS` Constant
**Problem:** Port numbers 3306/5432/1433 appear in 4+ `getDefaultPort()` function copies.
**Fix:** Create single `DEFAULT_PORTS` map in `src/types/config.ts` (where port constants already partially exist at line 177-182). Delete the duplicate `getDefaultPort()` functions in `SQLMCPServer.ts:471`, `wizard.ts:655`, `config-handlers.ts:13`, `adapters/index.ts:64`.
**Effort:** 15 min

### 3.2 Extract `createToolResponse()` Helper
**Problem:** 22+ instances of `{ content: [{ type: "text", text }], _meta: { progressToken: null } }` in handlers.
**Fix:** Add to existing `src/utils/response-formatter.ts`:
```typescript
export function createToolResponse(text: string, isError = false): MCPToolResponse {
  return { content: [{ type: "text", text }], ...(isError && { isError: true }) };
}
```
**Effort:** 30 min

### 3.3 Extract `getErrorMessage()` Utility
**Problem:** `error instanceof Error ? error.message : 'Unknown error'` repeated 9+ times.
**Fix:** Add to `src/utils/error-handler.ts`:
```typescript
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
```
**Effort:** 15 min

### 3.4 Extract `requireDbConfig()` Helper
**Problem:** Same db config lookup + throw pattern in 9 places across handlers.
**Fix:** Add to handler utilities:
```typescript
export function requireDbConfig(config: ParsedServerConfig, database: string): DatabaseConfig {
  const dbConfig = config.databases[database];
  if (!dbConfig) throw new ConfigurationError(`Database '${database}' not found`);
  return dbConfig;
}
```
**Effort:** 15 min

---

## Tier 4: TypeScript Quality (Do Fourth)

### 4.1 Fix `as any` Casts (3 instances)
- `src/setup.ts:50,61` — Change `as any` to `as string` (it's a string from `.split()`)
- `src/database/adapters/sqlite.ts:58` — Extract typed helper: `isConnectionOpen(db: SQLiteDatabase): boolean`
- `src/database/adapters/postgresql.ts:66` — Same pattern for `_connected` check

**Effort:** 15 min

### 4.2 Tighten Loose Types
- `src/types/mcp.ts:47-48` — Change `object` to `Record<string, unknown>`
- `src/utils/logger.ts:86` — Add null check before `this.logStream!.end()`

**Effort:** 10 min

### 4.3 Standardize Error Usage
**Problem:** 56 `throw new Error()` vs 12 custom error class usages. Not all need changing, but key paths should use typed errors.
**Fix:** Audit the handlers and dispatcher — these are the user-facing paths. Replace generic `Error` with `ValidationError`, `ConfigurationError`, etc. where the type is already defined. Leave internal/unreachable throws as generic `Error`.
**Effort:** 30 min

---

## Tier 5: Nice-to-Have (Do If Time Permits)

### 5.1 Expand Integration Tests
- Current: 5 test blocks. Target: 15-20 covering core MCP tool flows.
- Focus on error paths and edge cases, not happy paths (unit tests cover those).

### 5.2 Add GitHub Actions CI
- Basic workflow: lint → type-check → test on PR
- No Docker/database integration tests needed yet.

### 5.3 Verify `supertest` Dependency Usage
- Listed in devDependencies but may be unused. Remove if so.

---

## Rejected Findings (With Rationale)

| Finding | Auditor Said | Devil's Advocate Said | Verdict |
|---------|-------------|----------------------|---------|
| Split ConnectionManager (985L) | Extract 2-3 classes | Cohesive domain class, splitting adds coupling | **REJECT** — navigable at this scale |
| Split SecurityManager (899L) | Extract strategy objects | Pattern rules belong together | **REJECT** — single responsibility is "security validation" |
| Transaction method "duplication" | 12 identical methods | That's the adapter pattern — each has different driver API | **REJECT** — structural, not accidental |
| Schema capture "duplication" (~628L) | Template method in base | Each DB has fundamentally different SQL | **REJECT** — engine-specific, not extractable |
| SQLite Promise wrappers | Use util.promisify | Necessary adaptation layer | **REJECT** — this IS the fix |
| Enable `noUncheckedIndexedAccess` | Better type safety | Hundreds of unnecessary `undefined` checks in DB code | **REJECT** — deliberate tsconfig choice |
| Add Prettier | Formatting consistency | ESLint already handles it | **REJECT** — preference, not quality |
| Unified ConfigManager | Single source of truth | Would be pass-through wrapper adding indirection | **REJECT** — config is simple INI |
| Type casts in adapters (44x) | Extract getter in base | Casts are adapter-pattern boilerplate | **REJECT** — marginal improvement |
| Add SIGTERM handler | Missing lifecycle mgmt | Already exists at `src/index.ts:45-77` | **REJECT** — audit was wrong |

---

## Execution Order

```
Phase 1 (30 min): Tier 1 — Fix bugs and correctness issues
  1.1 Deduplicate error classes
  1.2 Remove DOM from tsconfig
  1.3 Delete unused methods

Phase 2 (1 hr): Tier 2 — SSL verification config option

Phase 3 (1.5 hr): Tier 3 — Practical deduplication
  3.1 DEFAULT_PORTS constant
  3.2 createToolResponse() helper
  3.3 getErrorMessage() utility
  3.4 requireDbConfig() helper

Phase 4 (1 hr): Tier 4 — TypeScript quality
  4.1 Fix as any casts
  4.2 Tighten loose types
  4.3 Standardize error usage in handlers

Phase 5 (optional): Tier 5 — Testing & CI improvements
```

**Total estimated: ~4 hours for Tiers 1-4**
