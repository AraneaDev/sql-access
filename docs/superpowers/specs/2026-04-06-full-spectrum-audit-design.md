---
title: Full Spectrum Audit — Improvement Plan
date: 2026-04-06
status: approved
---

# Full Spectrum Audit — Design Spec

## Overview

A single comprehensive session to improve sql-ts across six dimensions: observability, error recovery, query caching, type safety, security hardening, and test coverage. All changes are additive or refinements to existing code. One new MCP tool is exposed (`sql_get_metrics`). Nothing is deleted.

---

## 1. Observability — MetricsManager + `sql_get_metrics`

### New file: `src/classes/MetricsManager.ts`

Tracks per-database metrics in memory using a single class instantiated by SQLMCPServer and passed to ConnectionManager.

**Tracked metrics per database:**
- Query latency: min/max/avg/p95, computed from a rolling window of the last 1,000 query durations
- Error counts by category: CONNECTION, QUERY, SECURITY, SSH, TIMEOUT
- Pool utilization: active vs idle connections (sampled at query time from pool state)
- Query counts: total, successful, failed
- Circuit breaker events: timestamp and transition type (open/closed/half_open)
- Cache hit/miss counts

**API:**
```typescript
metrics.recordQuery(dbName, durationMs, success, errorCategory?)
metrics.recordCircuitEvent(dbName, event: 'open' | 'closed' | 'half_open')
metrics.recordCacheHit(dbName)
metrics.recordCacheMiss(dbName)
metrics.getSnapshot(dbName?: string): MetricsSnapshot
metrics.reset(dbName?: string): void
```

**Storage:** In-memory only. Metrics reset on server restart. No persistence dependency added.

### New MCP tool: `sql_get_metrics`

- **Input:** optional `database` string (omit = all databases)
- **Output:** formatted snapshot — latency stats, error breakdown, pool state, circuit state, cache hit rate, uptime
- **Side effects:** none (read-only)
- **Registration:** added to `src/tools/tool-definitions.ts` and handled in `src/tools/handlers/`

### Integration

`ConnectionManager.executeQuery()` wraps each adapter call:
```
start = Date.now()
try { result = await adapter.executeQuery(...); metrics.recordQuery(db, elapsed, true) }
catch { metrics.recordQuery(db, elapsed, false, category) }
```

---

## 2. Circuit Breaker (ConnectionManager)

### State machine per database

Three states: `CLOSED` (normal) → `OPEN` (failing, fast-reject) → `HALF_OPEN` (probe).

**Transitions:**
- `CLOSED → OPEN`: 5 consecutive connection failures within a 60s window
- `OPEN → HALF_OPEN`: 30s cooldown elapsed, one probe attempt allowed through
- `HALF_OPEN → CLOSED`: probe succeeds — reset failure count and window
- `HALF_OPEN → OPEN`: probe fails — restart cooldown timer

**Implementation:** `CircuitBreakerState` record (per DB) stored inside ConnectionManager. No new class. ~80 LOC.

```typescript
interface CircuitBreakerState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  windowStart: number;       // ms timestamp
  openedAt: number | null;   // ms timestamp
}
```

**Fast-reject behavior:** When a query arrives for an OPEN circuit, throw `CircuitOpenError` immediately:
> `"Database 'area51' is currently unavailable — retry in 18s"`

`CircuitOpenError` is a new subclass of `ConnectionError`.

**Constants (named, not magic numbers):**
```typescript
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_COOLDOWN_MS = 30_000;
```

**Metrics integration:** Each state transition calls `metrics.recordCircuitEvent(dbName, event)`.

---

## 3. Query Cache (TTL-based LRU)

### New file: `src/classes/QueryCache.ts`

In-process LRU cache with per-entry TTL. Implemented with a `Map` (insertion-order iteration for LRU eviction). No external dependency.

**Cache key:** `sha256(dbName + normalizedSQL + JSON.stringify(params))`
- Normalized SQL: whitespace-collapsed, lowercased

**Defaults (overridable per-DB via config.ini):**
- `cache_ttl_seconds = 60`
- Max entries: 100 per database

**Rules:**
- Only `SELECT` statements are cached
- Mutations (INSERT/UPDATE/DELETE/DROP/ALTER) bypass cache and invalidate all cached entries for the same DB
- Queries containing non-deterministic functions are never cached: `NOW()`, `RAND()`, `UUID()`, `CURRENT_TIMESTAMP`, `SYSDATE()`

**Cache hit response:** includes `cached: true` in response metadata so callers can distinguish live vs cached results.

**Integration point:** `ConnectionManager.executeQuery()` checks cache before dispatching to adapter.

**Metrics integration:** `metrics.recordCacheHit(dbName)` / `metrics.recordCacheMiss(dbName)`

---

## 4. Type Safety & Code Hygiene

### `any` elimination (13 instances)

- Handler contexts: replace `any` with specific union types or `unknown` + type guards
- Config parsing: replace `any` with `Record<string, string | number | boolean>` or existing config interfaces from `src/types/`
- Adapter internals: use proper driver types (`mysql2.PoolConnection`, `pg.PoolClient`, `mssql.IResult<T>`)

### Type assertion cleanup (3 remaining)

Same pattern as the `d8577df` refactor:
- `mysql.ts:76`: extract typed local const instead of `as unknown as DatabaseConnection`
- `postgresql.ts:64`: same treatment
- MSSQL connection casting: same treatment

### Centralized config validation

New function `validateDatabaseConfig(config: DatabaseConfig): ValidationResult` in `src/utils/config.ts`.

- Checks required fields per adapter: MySQL/PostgreSQL need host/port/user/password/database; SQLite needs only path; MSSQL needs host/port/user/password/database/instance(optional)
- Returns structured errors with field names, not thrown exceptions — caller decides severity
- Called at startup for all configured databases; logs warnings for invalid entries rather than crashing

**Why not generics on adapters:** The base adapter interface is already narrow. Generics would cascade changes through all four adapters for marginal type-safety benefit — deferred.

---

## 5. Security Hardening

### SSH key file permission validation

Before loading a private key in `EnhancedSSHTunnelManager`:
```typescript
const stat = await fs.stat(keyPath);
const mode = stat.mode & 0o777;
if (mode & 0o004) throw new ConfigurationError(`SSH key ${keyPath} is world-readable`);
if (mode & 0o044) logger.warn(`SSH key ${keyPath} has loose permissions (recommend 0600)`);
```

Mirrors the existing `config.ini` permission check in `src/utils/config.ts:49-62`.

### Connection string validation

Added to `validateDatabaseConfig()` (Section 4):
- Host format: reject embedded credentials (`user:pass@host` pattern)
- Port range: must be 1–65535
- Database name: reject shell metacharacters (`; & | $ ( ) > <`)

### Optional query audit log

New file: `src/utils/audit-logger.ts` (~60 LOC)

**Config:** `audit_log = true` in a `[database.name]` section enables it for that DB.

**Log format (one line per query):**
```
2026-04-06T14:23:01.123Z  area51  a3f9c2d1  245ms  success
2026-04-06T14:23:05.456Z  area51  b1e7a904  12ms   error:QUERY
```
Fields: timestamp, dbName, query hash (SHA256 of normalized SQL, never params), duration, outcome.

**Location:** `~/.sql-ts/audit/<dbname>.log`

**What is NOT logged:** query params (may contain PII), full SQL text.

**What we're NOT doing:** In-memory credential encryption or secrets manager integration — significant architectural change with external dependencies, deferred.

---

## 6. Test Coverage Gaps

### New test files

**`tests/unit/circuit-breaker.test.ts`**
- All state transitions: CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED, HALF_OPEN→OPEN
- Uses `jest.useFakeTimers()` — no real waiting
- Verifies `CircuitOpenError` message includes time-until-half-open

**`tests/unit/query-cache.test.ts`**
- Cache hit and miss
- TTL expiry (fake timers)
- LRU eviction at max capacity
- Non-deterministic function bypass
- Mutation invalidation clears DB entries
- Cache key normalisation (whitespace/case variants hit same entry)

### Extended test files

**`tests/integration/ssh-tunnel.test.ts`** (new or extend)
- Successful tunnel creation
- Auth failure (password + key)
- 45s timeout fires (fake timers)
- Tunnel drop mid-query triggers reconnect

**`tests/unit/connection-manager.test.ts`** (extend)
- Pool exhaustion: queries queue, timeout fires, circuit breaker advances on repeated exhaustion

**`tests/unit/schema-manager.test.ts`** (extend)
- Concurrent `sql_get_schema` calls on same DB: only one refresh fires, second awaits same promise

---

## Affected Files Summary

| File | Change type |
|------|-------------|
| `src/classes/MetricsManager.ts` | New |
| `src/classes/QueryCache.ts` | New |
| `src/utils/audit-logger.ts` | New |
| `tests/unit/circuit-breaker.test.ts` | New |
| `tests/unit/query-cache.test.ts` | New |
| `src/classes/ConnectionManager.ts` | Extend — circuit breaker, cache, metrics wiring |
| `src/classes/SQLMCPServer.ts` | Extend — wire MetricsManager, QueryCache |
| `src/tools/tool-definitions.ts` | Extend — add `sql_get_metrics` |
| `src/tools/handlers/` | Extend — handler for `sql_get_metrics` |
| `src/database/adapters/mysql.ts` | Refine — type assertion cleanup |
| `src/database/adapters/postgresql.ts` | Refine — type assertion cleanup |
| `src/database/adapters/mssql.ts` | Refine — type assertion cleanup |
| `src/utils/config.ts` | Extend — `validateDatabaseConfig()`, SSH key check |
| `tests/integration/ssh-tunnel.test.ts` | New/extend |
| `tests/unit/connection-manager.test.ts` | Extend |
| `tests/unit/schema-manager.test.ts` | Extend |

---

## Out of Scope (deferred)

- In-memory credential encryption / secrets manager integration
- Generics on database adapters
- Metrics persistence across restarts
- Rate limiting per database
- External query result cache (Redis/Memcached)
