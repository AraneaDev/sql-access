# Full Spectrum Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve sql-ts across six dimensions — observability (MetricsManager + `sql_get_metrics`), circuit breaking, query caching, type safety, security hardening, and test coverage — in a single comprehensive session.

**Architecture:** MetricsManager and QueryCache are instantiated by `SQLMCPServer.initialize()` and injected into ConnectionManager. Circuit breaker state lives as a `Map<string, CircuitBreakerState>` inside ConnectionManager, driven by pure functions in `src/utils/circuit-breaker.ts`. All query-path integration happens in `ConnectionManager.executeQuery()`. One new MCP tool (`sql_get_metrics`) is wired through tool-definitions → handler → dispatcher → ToolHandlerContext.

**Tech Stack:** TypeScript 5 (ESM, `.js` import extensions), Jest 29 with fake timers, `node:crypto` for SHA256, `node:fs/promises` for audit log, `node:os` for home directory, existing error-handler.ts error hierarchy.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/classes/MetricsManager.ts` | In-memory per-DB metrics (latency, errors, circuit events, cache hits) |
| `src/classes/QueryCache.ts` | TTL-LRU query cache, `Map<dbName, Map<key, CacheEntry>>` |
| `src/utils/circuit-breaker.ts` | Pure state-machine functions + constants for circuit breaker |
| `src/utils/audit-logger.ts` | Append-only per-DB audit log to `~/.sql-ts/audit/` |
| `src/tools/handlers/metrics-handlers.ts` | Handler for `sql_get_metrics` tool |
| `tests/unit/metrics-manager.test.ts` | Unit tests for MetricsManager |
| `tests/unit/query-cache.test.ts` | Unit tests for QueryCache |
| `tests/unit/circuit-breaker.test.ts` | Unit tests for circuit breaker state machine |

### Modified files
| File | What changes |
|------|-------------|
| `src/utils/error-handler.ts` | Add `CircuitOpenError extends ConnectionError` |
| `src/utils/config.ts` | Add `validateDatabaseConfig()` + connection string checks |
| `src/classes/ConnectionManager.ts` | Add circuit breaker map, cache + metrics calls in `executeQuery` |
| `src/classes/SQLMCPServer.ts` | Instantiate MetricsManager + QueryCache, update ConnectionManager construction |
| `src/classes/EnhancedSSHTunnelManager.ts` | SSH key permission check before loading private keys |
| `src/tools/handlers/types.ts` | Add `metricsManager: MetricsManager` to `ToolHandlerContext` |
| `src/tools/tool-definitions.ts` | Add `sql_get_metrics` tool definition |
| `src/tools/dispatcher.ts` | Add `sql_get_metrics` case |
| `src/database/adapters/mysql.ts` | Remove `as unknown as DatabaseConnection` type assertion |
| `src/database/adapters/postgresql.ts` | Remove `as unknown as DatabaseConnection` type assertion |
| `src/database/adapters/mssql.ts` | Remove type assertion, fix any remaining `any` |
| `tests/unit/connection-manager.test.ts` | Add pool exhaustion + circuit breaker integration tests |
| `tests/unit/schema-manager.test.ts` | Add concurrent refresh race condition test |
| `tests/integration/ssh-tunnel.test.ts` | Add/extend SSH tunnel failure + reconnect tests |

---

## Task 0: Fix Flaky Timing Test

**Files:**
- Modify: `tests/unit/connection-manager.test.ts`

Pre-existing baseline failure: `tests/unit/connection-manager.test.ts:680` asserts `expect(elapsed).toBeGreaterThanOrEqual(2000)` — a wall-clock timing check that races in this environment.

- [ ] **Step 0.1: Read the failing test**

Read `tests/unit/connection-manager.test.ts` around line 680 to understand what the test is checking (retry delay timing).

- [ ] **Step 0.2: Fix with fake timers**

Replace the wall-clock timing assertion with `jest.useFakeTimers()` so the test controls time rather than measuring it. The test should:
1. Use `jest.useFakeTimers()` in `beforeEach` / `afterEach`
2. Advance time with `jest.advanceTimersByTime(ms)` to simulate the delay
3. Remove the `expect(elapsed).toBeGreaterThanOrEqual(2000)` wall-clock assertion — instead verify the retry *count* and that the delay was *scheduled* (not that real ms elapsed)

If the test cannot be converted to fake timers (e.g. it needs real async resolution), lower the threshold with a generous tolerance: `toBeGreaterThanOrEqual(500)` and a comment explaining the tolerance.

- [ ] **Step 0.3: Run the previously-failing test to verify it passes**

```bash
npx jest tests/unit/connection-manager.test.ts --no-coverage 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 0.4: Run full suite to verify no regressions**

```bash
npx jest --no-coverage 2>&1 | tail -5
```
Expected: All tests pass

- [ ] **Step 0.5: Commit**

```bash
git add tests/unit/connection-manager.test.ts
git commit -m "fix: convert flaky timing assertion to fake timers in connection-manager test"
```

---

## Task 1: MetricsManager

**Files:**
- Create: `src/classes/MetricsManager.ts`
- Test: `tests/unit/metrics-manager.test.ts`

- [ ] **Step 1.1: Write failing tests**

```typescript
// tests/unit/metrics-manager.test.ts
import { MetricsManager } from '../../src/classes/MetricsManager.js';

describe('MetricsManager', () => {
  let m: MetricsManager;
  beforeEach(() => { m = new MetricsManager(); });

  describe('recordQuery', () => {
    it('increments total and success counts', () => {
      m.recordQuery('db1', 100, true);
      m.recordQuery('db1', 200, true);
      const snap = m.getSnapshot('db1');
      expect(snap.queries.total).toBe(2);
      expect(snap.queries.success).toBe(2);
      expect(snap.queries.failed).toBe(0);
    });

    it('increments failed count and error category on failure', () => {
      m.recordQuery('db1', 50, false, 'CONNECTION');
      const snap = m.getSnapshot('db1');
      expect(snap.queries.failed).toBe(1);
      expect(snap.errors['CONNECTION']).toBe(1);
    });

    it('keeps latency rolling window at max 1000 entries', () => {
      for (let i = 0; i < 1100; i++) m.recordQuery('db1', i % 100, true);
      const snap = m.getSnapshot('db1');
      expect(snap.latency.count).toBe(1000);
    });
  });

  describe('computeLatencyStats / p95', () => {
    it('computes p95 correctly for known sequence', () => {
      // 100 values 1-100ms: p95 index = floor(100 * 0.95) = 95 → value 96
      for (let i = 1; i <= 100; i++) m.recordQuery('db1', i, true);
      const snap = m.getSnapshot('db1');
      expect(snap.latency.p95).toBe(96);
      expect(snap.latency.min).toBe(1);
      expect(snap.latency.max).toBe(100);
      expect(snap.latency.avg).toBe(51); // Math.round(5050/100) = 50.5 → 51
    });

    it('returns zeros for empty latency window', () => {
      const snap = m.getSnapshot('db1');
      expect(snap.latency).toEqual({ min: 0, max: 0, avg: 0, p95: 0, count: 0 });
    });
  });

  describe('recordCircuitEvent', () => {
    it('records circuit events with timestamps', () => {
      m.recordCircuitEvent('db1', 'open');
      m.recordCircuitEvent('db1', 'half_open');
      const snap = m.getSnapshot('db1');
      expect(snap.circuit.events).toHaveLength(2);
      expect(snap.circuit.events[0].event).toBe('open');
    });
  });

  describe('recordCacheHit / recordCacheMiss', () => {
    it('computes hit rate correctly', () => {
      m.recordCacheHit('db1');
      m.recordCacheHit('db1');
      m.recordCacheMiss('db1');
      const snap = m.getSnapshot('db1');
      expect(snap.cache.hits).toBe(2);
      expect(snap.cache.misses).toBe(1);
      expect(snap.cache.hitRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('getSnapshot', () => {
    it('returns all-DB snapshot when no dbName given', () => {
      m.recordQuery('db1', 100, true);
      m.recordQuery('db2', 200, true);
      const all = m.getSnapshot();
      expect(all).toHaveLength(2);
    });

    it('returns single-DB snapshot as array of one', () => {
      m.recordQuery('db1', 100, true);
      const snap = m.getSnapshot('db1');
      expect(snap).not.toBeNull();
    });
  });

  describe('reset', () => {
    it('clears one DB without affecting others', () => {
      m.recordQuery('db1', 100, true);
      m.recordQuery('db2', 100, true);
      m.reset('db1');
      expect(m.getSnapshot('db1').queries.total).toBe(0);
      expect(m.getSnapshot('db2').queries.total).toBe(1);
    });

    it('clears all DBs when no name given', () => {
      m.recordQuery('db1', 100, true);
      m.recordQuery('db2', 100, true);
      m.reset();
      expect(m.getSnapshot('db1').queries.total).toBe(0);
      expect(m.getSnapshot('db2').queries.total).toBe(0);
    });
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
npx jest tests/unit/metrics-manager.test.ts --no-coverage 2>&1 | tail -20
```
Expected: Cannot find module `../../src/classes/MetricsManager.js`

- [ ] **Step 1.3: Implement MetricsManager**

```typescript
// src/classes/MetricsManager.ts

export interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
  count: number;
}

export interface MetricsSnapshot {
  database: string;
  uptime: number;
  queries: { total: number; success: number; failed: number };
  latency: LatencyStats;
  errors: Record<string, number>;
  circuit: { events: Array<{ ts: number; event: string }> };
  cache: { hits: number; misses: number; hitRate: number };
}

const LATENCY_WINDOW = 1000;

interface DBMetrics {
  latencies: number[];
  queries: { total: number; success: number; failed: number };
  errors: Record<string, number>;
  circuitEvents: Array<{ ts: number; event: string }>;
  cacheHits: number;
  cacheMisses: number;
  startedAt: number;
}

function emptyMetrics(): DBMetrics {
  return {
    latencies: [],
    queries: { total: 0, success: 0, failed: 0 },
    errors: {},
    circuitEvents: [],
    cacheHits: 0,
    cacheMisses: 0,
    startedAt: Date.now(),
  };
}

function computeLatencyStats(latencies: number[]): LatencyStats {
  if (latencies.length === 0) return { min: 0, max: 0, avg: 0, p95: 0, count: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
    count: sorted.length,
  };
}

export class MetricsManager {
  private readonly dbs = new Map<string, DBMetrics>();

  private getOrCreate(dbName: string): DBMetrics {
    let m = this.dbs.get(dbName);
    if (!m) { m = emptyMetrics(); this.dbs.set(dbName, m); }
    return m;
  }

  recordQuery(dbName: string, durationMs: number, success: boolean, errorCategory?: string): void {
    const m = this.getOrCreate(dbName);
    m.queries.total++;
    if (success) {
      m.queries.success++;
    } else {
      m.queries.failed++;
      if (errorCategory) m.errors[errorCategory] = (m.errors[errorCategory] ?? 0) + 1;
    }
    m.latencies.push(durationMs);
    if (m.latencies.length > LATENCY_WINDOW) m.latencies.shift();
  }

  recordCircuitEvent(dbName: string, event: 'open' | 'closed' | 'half_open'): void {
    this.getOrCreate(dbName).circuitEvents.push({ ts: Date.now(), event });
  }

  recordCacheHit(dbName: string): void { this.getOrCreate(dbName).cacheHits++; }
  recordCacheMiss(dbName: string): void { this.getOrCreate(dbName).cacheMisses++; }

  getSnapshot(dbName: string): MetricsSnapshot;
  getSnapshot(): MetricsSnapshot[];
  getSnapshot(dbName?: string): MetricsSnapshot | MetricsSnapshot[] {
    if (dbName !== undefined) {
      return this.buildSnapshot(dbName, this.getOrCreate(dbName));
    }
    return [...this.dbs.entries()].map(([name, m]) => this.buildSnapshot(name, m));
  }

  reset(dbName?: string): void {
    if (dbName !== undefined) {
      this.dbs.set(dbName, emptyMetrics());
    } else {
      for (const key of this.dbs.keys()) this.dbs.set(key, emptyMetrics());
    }
  }

  private buildSnapshot(database: string, m: DBMetrics): MetricsSnapshot {
    const total = m.cacheHits + m.cacheMisses;
    return {
      database,
      uptime: Date.now() - m.startedAt,
      queries: { ...m.queries },
      latency: computeLatencyStats(m.latencies),
      errors: { ...m.errors },
      circuit: { events: [...m.circuitEvents] },
      cache: {
        hits: m.cacheHits,
        misses: m.cacheMisses,
        hitRate: total === 0 ? 0 : m.cacheHits / total,
      },
    };
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
npx jest tests/unit/metrics-manager.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add src/classes/MetricsManager.ts tests/unit/metrics-manager.test.ts
git commit -m "feat: add MetricsManager with per-DB latency, error, circuit, and cache tracking"
```

---

## Task 2: QueryCache

**Files:**
- Create: `src/classes/QueryCache.ts`
- Test: `tests/unit/query-cache.test.ts`

- [ ] **Step 2.1: Write failing tests**

```typescript
// tests/unit/query-cache.test.ts
import { QueryCache } from '../../src/classes/QueryCache.js';

describe('QueryCache', () => {
  let cache: QueryCache;
  const fakeResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new QueryCache();
  });
  afterEach(() => jest.useRealTimers());

  describe('get / set', () => {
    it('returns undefined on cache miss', () => {
      expect(cache.get('db1', 'SELECT 1', [])).toBeUndefined();
    });

    it('returns cached result on hit', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 60);
      const hit = cache.get('db1', 'SELECT 1', []);
      expect(hit).toEqual(fakeResult);
    });

    it('normalises whitespace and case for cache key', () => {
      cache.set('db1', 'SELECT  *  FROM  foo', [], fakeResult, 60);
      const hit = cache.get('db1', 'select * from foo', []);
      expect(hit).toEqual(fakeResult);
    });

    it('returns undefined after TTL expires', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 10); // 10s TTL
      jest.advanceTimersByTime(11_000);
      expect(cache.get('db1', 'SELECT 1', [])).toBeUndefined();
    });

    it('does not cache non-deterministic queries', () => {
      cache.set('db1', 'SELECT NOW()', [], fakeResult, 60);
      expect(cache.get('db1', 'SELECT NOW()', [])).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when DB capacity exceeded', () => {
      const smallCache = new QueryCache({ maxEntriesPerDb: 3 });
      smallCache.set('db1', 'SELECT 1', [], fakeResult, 60);
      smallCache.set('db1', 'SELECT 2', [], fakeResult, 60);
      smallCache.set('db1', 'SELECT 3', [], fakeResult, 60);
      smallCache.set('db1', 'SELECT 4', [], fakeResult, 60); // evicts SELECT 1
      expect(smallCache.get('db1', 'SELECT 1', [])).toBeUndefined();
      expect(smallCache.get('db1', 'SELECT 4', [])).toEqual(fakeResult);
    });
  });

  describe('invalidate', () => {
    it('clears all entries for a DB on mutation', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 60);
      cache.set('db1', 'SELECT 2', [], fakeResult, 60);
      cache.invalidate('db1');
      expect(cache.get('db1', 'SELECT 1', [])).toBeUndefined();
      expect(cache.get('db1', 'SELECT 2', [])).toBeUndefined();
    });

    it('does not affect other DBs', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 60);
      cache.set('db2', 'SELECT 1', [], fakeResult, 60);
      cache.invalidate('db1');
      expect(cache.get('db2', 'SELECT 1', [])).toEqual(fakeResult);
    });
  });

  describe('shouldCache', () => {
    it('returns true for SELECT', () => {
      expect(cache.shouldCache('SELECT * FROM foo')).toBe(true);
    });
    it('returns false for INSERT', () => {
      expect(cache.shouldCache('INSERT INTO foo VALUES (1)')).toBe(false);
    });
    it('returns false for UPDATE', () => {
      expect(cache.shouldCache('UPDATE foo SET bar = 1')).toBe(false);
    });
    it('returns false for non-deterministic SELECT', () => {
      expect(cache.shouldCache('SELECT RAND()')).toBe(false);
    });
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
npx jest tests/unit/query-cache.test.ts --no-coverage 2>&1 | tail -10
```
Expected: Cannot find module

- [ ] **Step 2.3: Implement QueryCache**

```typescript
// src/classes/QueryCache.ts
import { createHash } from 'node:crypto';
import type { QueryResult } from '../types/index.js';

const NON_DETERMINISTIC_RE = /\b(now|rand|uuid|current_timestamp|sysdate|newid|random)\s*\(/i;
const MUTATION_RE = /^\s*(insert|update|delete|drop|truncate|alter|create|replace)\b/i;
const SELECT_RE = /^\s*select\b/i;

interface CacheEntry {
  result: QueryResult;
  expiresAt: number;
}

interface QueryCacheOptions {
  maxEntriesPerDb?: number;
}

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase().trim();
}

function makeKey(dbName: string, sql: string, params: unknown[]): string {
  return createHash('sha256')
    .update(dbName + '\x00' + normalise(sql) + '\x00' + JSON.stringify(params))
    .digest('hex');
}

export class QueryCache {
  private readonly store = new Map<string, Map<string, CacheEntry>>();
  private readonly maxEntries: number;

  constructor(options: QueryCacheOptions = {}) {
    this.maxEntries = options.maxEntriesPerDb ?? 100;
  }

  shouldCache(sql: string): boolean {
    if (!SELECT_RE.test(sql)) return false;
    if (NON_DETERMINISTIC_RE.test(sql)) return false;
    return true;
  }

  isMutation(sql: string): boolean {
    return MUTATION_RE.test(sql);
  }

  get(dbName: string, sql: string, params: unknown[]): QueryResult | undefined {
    if (!this.shouldCache(sql)) return undefined;
    const db = this.store.get(dbName);
    if (!db) return undefined;
    const key = makeKey(dbName, sql, params);
    const entry = db.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { db.delete(key); return undefined; }
    // Refresh LRU position
    db.delete(key);
    db.set(key, entry);
    return entry.result;
  }

  set(dbName: string, sql: string, params: unknown[], result: QueryResult, ttlSeconds: number): void {
    if (!this.shouldCache(sql)) return;
    let db = this.store.get(dbName);
    if (!db) { db = new Map(); this.store.set(dbName, db); }
    const key = makeKey(dbName, sql, params);
    // Evict oldest if at capacity
    if (db.size >= this.maxEntries && !db.has(key)) {
      const oldest = db.keys().next().value;
      if (oldest !== undefined) db.delete(oldest);
    }
    db.set(key, { result, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  invalidate(dbName: string): void {
    this.store.get(dbName)?.clear();
  }
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npx jest tests/unit/query-cache.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests PASS

- [ ] **Step 2.5: Commit**

```bash
git add src/classes/QueryCache.ts tests/unit/query-cache.test.ts
git commit -m "feat: add TTL-LRU QueryCache with per-DB partitioning and mutation invalidation"
```

---

## Task 3: CircuitOpenError + Circuit Breaker State Machine

**Files:**
- Modify: `src/utils/error-handler.ts` (add `CircuitOpenError`)
- Create: `src/utils/circuit-breaker.ts`
- Create: `tests/unit/circuit-breaker.test.ts`

- [ ] **Step 3.1: Write failing tests**

```typescript
// tests/unit/circuit-breaker.test.ts
import {
  initialCircuitState,
  shouldReject,
  recordFailure,
  recordSuccess,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
  CIRCUIT_WINDOW_MS,
} from '../../src/utils/circuit-breaker.js';

describe('circuit breaker state machine', () => {
  describe('CLOSED state', () => {
    it('starts CLOSED with 0 failures', () => {
      const s = initialCircuitState();
      expect(s.status).toBe('CLOSED');
      expect(s.failures).toBe(0);
    });

    it('stays CLOSED below failure threshold', () => {
      let s = initialCircuitState();
      const now = Date.now();
      for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD - 1; i++) {
        s = recordFailure(s, now);
      }
      expect(s.status).toBe('CLOSED');
    });

    it('transitions CLOSED → OPEN at threshold', () => {
      let s = initialCircuitState();
      const now = Date.now();
      for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) {
        s = recordFailure(s, now);
      }
      expect(s.status).toBe('OPEN');
      expect(s.openedAt).toBe(now);
    });

    it('resets failure count when window expires', () => {
      let s = initialCircuitState();
      const t0 = 1000;
      s = recordFailure(s, t0);
      s = recordFailure(s, t0 + CIRCUIT_WINDOW_MS + 1); // new window
      expect(s.failures).toBe(1); // reset, not 2
    });
  });

  describe('OPEN state', () => {
    function openState(now: number) {
      let s = initialCircuitState();
      for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) s = recordFailure(s, now);
      return s;
    }

    it('shouldReject returns true while OPEN and cooldown not elapsed', () => {
      const now = 10_000;
      const s = openState(now);
      const r = shouldReject(s, now + CIRCUIT_COOLDOWN_MS - 1);
      expect(r.reject).toBe(true);
      expect(r.retryInMs).toBeGreaterThan(0);
    });

    it('shouldReject returns false (probe allowed) after cooldown → HALF_OPEN', () => {
      const now = 10_000;
      const s = openState(now);
      const r = shouldReject(s, now + CIRCUIT_COOLDOWN_MS + 1);
      expect(r.reject).toBe(false);
      expect(r.transitionTo).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    it('transitions HALF_OPEN → CLOSED on success', () => {
      let s = initialCircuitState();
      s = { ...s, status: 'HALF_OPEN', openedAt: Date.now() };
      s = recordSuccess(s);
      expect(s.status).toBe('CLOSED');
      expect(s.failures).toBe(0);
      expect(s.openedAt).toBeNull();
    });

    it('transitions HALF_OPEN → OPEN on failure', () => {
      const now = Date.now();
      let s = initialCircuitState();
      s = { ...s, status: 'HALF_OPEN', openedAt: now };
      s = recordFailure(s, now + 1);
      expect(s.status).toBe('OPEN');
      expect(s.openedAt).toBe(now + 1);
    });
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
npx jest tests/unit/circuit-breaker.test.ts --no-coverage 2>&1 | tail -10
```
Expected: Cannot find module

- [ ] **Step 3.3: Implement circuit-breaker.ts**

```typescript
// src/utils/circuit-breaker.ts

export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_WINDOW_MS = 60_000;
export const CIRCUIT_COOLDOWN_MS = 30_000;

export type CircuitStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  status: CircuitStatus;
  failures: number;
  windowStart: number;
  openedAt: number | null;
}

export function initialCircuitState(): CircuitBreakerState {
  return { status: 'CLOSED', failures: 0, windowStart: Date.now(), openedAt: null };
}

export interface RejectResult {
  reject: true;
  retryInMs: number;
}
export interface AllowResult {
  reject: false;
  transitionTo?: 'HALF_OPEN';
}

export function shouldReject(state: CircuitBreakerState, now: number): RejectResult | AllowResult {
  if (state.status === 'CLOSED') return { reject: false };
  if (state.status === 'HALF_OPEN') return { reject: false };

  // OPEN: check if cooldown elapsed
  const elapsed = now - (state.openedAt ?? now);
  if (elapsed >= CIRCUIT_COOLDOWN_MS) {
    return { reject: false, transitionTo: 'HALF_OPEN' };
  }
  return { reject: true, retryInMs: CIRCUIT_COOLDOWN_MS - elapsed };
}

export function recordFailure(state: CircuitBreakerState, now: number): CircuitBreakerState {
  // Reset window if expired
  const windowExpired = (now - state.windowStart) > CIRCUIT_WINDOW_MS;
  const base: CircuitBreakerState = windowExpired
    ? { status: 'CLOSED', failures: 0, windowStart: now, openedAt: null }
    : state;

  // In HALF_OPEN, failure goes straight back to OPEN
  if (base.status === 'HALF_OPEN') {
    return { status: 'OPEN', failures: 1, windowStart: now, openedAt: now };
  }

  const failures = base.failures + 1;
  if (failures >= CIRCUIT_FAILURE_THRESHOLD) {
    return { status: 'OPEN', failures, windowStart: base.windowStart, openedAt: now };
  }
  return { ...base, failures };
}

export function recordSuccess(state: CircuitBreakerState): CircuitBreakerState {
  if (state.status === 'HALF_OPEN' || state.status === 'OPEN') {
    return { status: 'CLOSED', failures: 0, windowStart: Date.now(), openedAt: null };
  }
  // CLOSED: reset failure count on any success
  return { ...state, failures: 0 };
}
```

- [ ] **Step 3.4: Add CircuitOpenError to error-handler.ts**

Find `SSHTunnelError` class in `src/utils/error-handler.ts` and add `CircuitOpenError` immediately after it:

```typescript
export class CircuitOpenError extends ConnectionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'CircuitOpenError';
  }
}
```

Also export it from `src/types/index.ts` alongside the other error classes (find the error class re-exports and add `CircuitOpenError`).

- [ ] **Step 3.5: Run tests to verify they pass**

```bash
npx jest tests/unit/circuit-breaker.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests PASS

- [ ] **Step 3.6: Commit**

```bash
git add src/utils/circuit-breaker.ts src/utils/error-handler.ts src/types/index.ts tests/unit/circuit-breaker.test.ts
git commit -m "feat: add circuit breaker state machine and CircuitOpenError"
```

---

## Task 4: AuditLogger + DatabaseConfig extensions

**Files:**
- Create: `src/utils/audit-logger.ts`
- Modify: `src/types/database.ts` (add `audit_log` and `cache_ttl_seconds` fields)

- [ ] **Step 4.0: Extend DatabaseConfig with new optional fields**

In `src/types/database.ts`, find the `DatabaseConfig` interface and add:
```typescript
// Query cache TTL in seconds (default: 60). Only applies to SELECT queries.
cache_ttl_seconds?: number;
// When true, appends one log line per query to ~/.sql-ts/audit/<dbname>.log
audit_log?: boolean;
```

Also add `cache_ttl_seconds?: number` to the `parseDatabaseConfig` function in `src/utils/config.ts` so it is read from config.ini sections.

- [ ] **Step 4.1: Write failing tests for AuditLogger**

```typescript
// tests/unit/audit-logger.test.ts
import { hashQuery } from '../../src/utils/audit-logger.js';
import { jest } from '@jest/globals';

// Mock node:fs/promises to avoid real filesystem writes
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
}));

import { mkdir, appendFile } from 'node:fs/promises';
import { writeAuditLog } from '../../src/utils/audit-logger.js';

describe('hashQuery', () => {
  it('produces consistent 8-char hex for same SQL', () => {
    expect(hashQuery('SELECT 1')).toHaveLength(8);
    expect(hashQuery('SELECT 1')).toBe(hashQuery('SELECT 1'));
  });

  it('normalises whitespace and case', () => {
    expect(hashQuery('SELECT  1')).toBe(hashQuery('select 1'));
  });

  it('different SQL produces different hash', () => {
    expect(hashQuery('SELECT 1')).not.toBe(hashQuery('SELECT 2'));
  });
});

describe('writeAuditLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls mkdir and appendFile with correct paths', async () => {
    await writeAuditLog('mydb', 'SELECT 1', 42, 'success');
    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining('.sql-ts/audit'),
      { recursive: true }
    );
    expect(appendFile).toHaveBeenCalledWith(
      expect.stringContaining('mydb.log'),
      expect.stringContaining('success'),
      'utf8'
    );
  });

  it('log line contains timestamp, dbName, hash, duration, and outcome', async () => {
    await writeAuditLog('mydb', 'SELECT 1', 100, 'error:CONNECTION');
    const [, line] = (appendFile as jest.Mock).mock.calls[0] as [string, string, string];
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);   // ISO timestamp
    expect(line).toContain('mydb');
    expect(line).toContain('100ms');
    expect(line).toContain('error:CONNECTION');
  });

  it('never logs query params', async () => {
    await writeAuditLog('mydb', 'SELECT ?', 10, 'success');
    const [, line] = (appendFile as jest.Mock).mock.calls[0] as [string, string, string];
    expect(line).not.toContain('?');  // hash only, not raw SQL
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
npx jest tests/unit/audit-logger.test.ts --no-coverage 2>&1 | tail -10
```
Expected: Cannot find module

- [ ] **Step 4.3: Implement AuditLogger**

```typescript
// src/utils/audit-logger.ts
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export function hashQuery(sql: string): string {
  const normalized = sql.replace(/\s+/g, ' ').toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

export async function writeAuditLog(
  dbName: string,
  sql: string,
  durationMs: number,
  outcome: 'success' | string  // 'success' or 'error:CATEGORY'
): Promise<void> {
  const dir = join(homedir(), '.sql-ts', 'audit');
  await mkdir(dir, { recursive: true });
  const ts = new Date().toISOString();
  const line = `${ts}  ${dbName}  ${hashQuery(sql)}  ${durationMs}ms  ${outcome}\n`;
  await appendFile(join(dir, `${dbName}.log`), line, 'utf8');
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
npx jest tests/unit/audit-logger.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests PASS

- [ ] **Step 4.5: Commit**

```bash
git add src/utils/audit-logger.ts tests/unit/audit-logger.test.ts src/types/database.ts src/utils/config.ts
git commit -m "feat: add audit-logger and extend DatabaseConfig with audit_log and cache_ttl_seconds fields"
```

---

## Task 5: validateDatabaseConfig

**Files:**
- Modify: `src/utils/config.ts`
- Test: `tests/unit/config-validation.test.ts`

- [ ] **Step 5.0: Write failing tests**

```typescript
// tests/unit/config-validation.test.ts
import { validateDatabaseConfig } from '../../src/utils/config.js';

const base = { type: 'mysql' as const, host: 'localhost', port: 3306, user: 'u', password: 'p', database: 'db' };

describe('validateDatabaseConfig', () => {
  it('passes valid mysql config', () => {
    expect(validateDatabaseConfig(base).valid).toBe(true);
  });

  it('fails when host is missing for mysql', () => {
    const r = validateDatabaseConfig({ ...base, host: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'host')).toBe(true);
  });

  it('fails with embedded credentials in host', () => {
    const r = validateDatabaseConfig({ ...base, host: 'user:pass@myhost' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'host')).toBe(true);
  });

  it('fails when port is out of range', () => {
    const r = validateDatabaseConfig({ ...base, port: 99999 });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'port')).toBe(true);
  });

  it('fails when database name has shell metacharacters', () => {
    const r = validateDatabaseConfig({ ...base, database: 'db;rm -rf' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'database')).toBe(true);
  });

  it('passes valid sqlite config (only filename required)', () => {
    const r = validateDatabaseConfig({ type: 'sqlite' as const, filename: '/tmp/test.db' } as never);
    expect(r.valid).toBe(true);
  });

  it('fails sqlite config with no filename', () => {
    const r = validateDatabaseConfig({ type: 'sqlite' as const } as never);
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 5.0b: Run tests to verify they fail**

```bash
npx jest tests/unit/config-validation.test.ts --no-coverage 2>&1 | tail -10
```
Expected: Cannot find named export `validateDatabaseConfig`

- [ ] **Step 5.1: Add ValidationResult type and validateDatabaseConfig function**

Open `src/utils/config.ts`. Add the following after the existing imports and before `loadConfiguration`:

```typescript
export interface ConfigFieldError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ConfigFieldError[];
}

const SHELL_METACHAR_RE = /[;&|$()><]/;
const EMBEDDED_CREDENTIALS_RE = /[^@]+:[^@]+@/;  // user:pass@host pattern

export function validateDatabaseConfig(config: DatabaseConfig): ValidationResult {
  const errors: ConfigFieldError[] = [];
  const t = config.type;

  // Required fields by type
  if (t === 'mysql' || t === 'postgresql' || t === 'mssql') {
    if (!config.host) errors.push({ field: 'host', message: 'host is required' });
    if (!config.port) errors.push({ field: 'port', message: 'port is required' });
    if (!config.user) errors.push({ field: 'user', message: 'user is required' });
    if (!config.password) errors.push({ field: 'password', message: 'password is required' });
    if (!config.database) errors.push({ field: 'database', message: 'database is required' });
  }
  if (t === 'sqlite') {
    if (!config.filename) errors.push({ field: 'filename', message: 'filename is required for sqlite' });
  }

  // Host validation
  if (config.host) {
    if (EMBEDDED_CREDENTIALS_RE.test(config.host)) {
      errors.push({ field: 'host', message: 'host must not contain embedded credentials (user:pass@host)' });
    }
  }

  // Port range
  if (config.port !== undefined) {
    const p = Number(config.port);
    if (isNaN(p) || p < 1 || p > 65535) {
      errors.push({ field: 'port', message: 'port must be between 1 and 65535' });
    }
  }

  // Database name safety
  if (config.database && SHELL_METACHAR_RE.test(config.database)) {
    errors.push({ field: 'database', message: 'database name contains invalid characters' });
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5.2: Call validateDatabaseConfig at startup**

In `src/utils/config.ts`, find `validateDatabaseConfiguration` (line ~478). Add a call to `validateDatabaseConfig` inside it and log warnings for any returned errors. The existing function throws on critical issues; use it to also surface the new structural checks.

- [ ] **Step 5.3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
npx jest tests/unit/config-validation.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests PASS

- [ ] **Step 5.5: Commit**

```bash
git add src/utils/config.ts tests/unit/config-validation.test.ts
git commit -m "feat: add validateDatabaseConfig with host, port, and database name validation"
```

---

## Task 6: SSH Key Permission Check

**Files:**
- Modify: `src/classes/EnhancedSSHTunnelManager.ts`

- [ ] **Step 6.1: Add permission check before loading private keys**

In `src/classes/EnhancedSSHTunnelManager.ts`, add these imports at the top if not already present:
```typescript
import { stat } from 'node:fs/promises';
import { getLogger } from '../utils/logger.js';
import { ConfigurationError } from '../utils/error-handler.js';
```

Add this helper function before the class:
```typescript
async function checkKeyFilePermissions(keyPath: string): Promise<void> {
  const s = await stat(keyPath);
  const mode = s.mode & 0o777;
  if (mode & 0o004) {
    throw new ConfigurationError(
      `SSH private key '${keyPath}' is world-readable (mode ${mode.toString(8)}). ` +
      'Fix with: chmod 600 <keyfile>'
    );
  }
  if (mode & 0o044) {
    // group-readable or other-readable — warn but don't throw
    // Use the existing logger instance; since this is a module-level function,
    // call getLogger() inline:
    getLogger('EnhancedSSHTunnelManager').warn(
      `SSH private key '${keyPath}' has loose permissions (recommend chmod 600)`
    );
  }
}
```

In the method that reads SSH private keys (search for `privateKey` or `readFileSync` usage in the file), call `await checkKeyFilePermissions(keyPath)` before reading the key. If the read is synchronous, convert it to async or add an async wrapper.

Check that `ConfigurationError` and `getLogger` imports above don't duplicate any existing imports in the file — merge with existing if needed.

- [ ] **Step 6.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors

- [ ] **Step 6.3: Commit**

```bash
git add src/classes/EnhancedSSHTunnelManager.ts
git commit -m "feat: validate SSH private key file permissions before loading"
```

---

## Task 7: Wire MetricsManager + QueryCache + Circuit Breaker into ConnectionManager

**Files:**
- Modify: `src/classes/ConnectionManager.ts`

This is the largest change. Read the full file before editing. The key method is `executeQuery` at line 704.

- [ ] **Step 7.1: Add imports to ConnectionManager.ts**

Add to the top of `src/classes/ConnectionManager.ts`:
```typescript
import { MetricsManager } from './MetricsManager.js';
import { QueryCache } from './QueryCache.js';
import {
  CircuitBreakerState,
  initialCircuitState,
  shouldReject,
  recordFailure,
  recordSuccess,
  CIRCUIT_COOLDOWN_MS,
} from '../utils/circuit-breaker.js';
import { CircuitOpenError } from '../utils/error-handler.js';
import { writeAuditLog } from '../utils/audit-logger.js';
```

- [ ] **Step 7.2: Add member variables and update constructor**

In the `ConnectionManager` class, add these private members (after existing members):
```typescript
private circuits = new Map<string, CircuitBreakerState>();
private metrics?: MetricsManager;
private queryCache?: QueryCache;
```

Update the constructor signature to accept optional dependencies:
```typescript
constructor(
  sshTunnelManager: EnhancedSSHTunnelManager,
  metrics?: MetricsManager,
  queryCache?: QueryCache
) {
  super();
  this.sshTunnelManager = sshTunnelManager;
  this.metrics = metrics;
  this.queryCache = queryCache;
}
```

Add a helper to get-or-create circuit state:
```typescript
private getCircuit(dbName: string): CircuitBreakerState {
  let s = this.circuits.get(dbName);
  if (!s) { s = initialCircuitState(); this.circuits.set(dbName, s); }
  return s;
}
```

- [ ] **Step 7.3: Wrap executeQuery with circuit breaker + cache + metrics**

Find `executeQuery` at line ~704. The existing method body executes the query. Wrap it as follows (keep the existing internals, just add the surrounding logic):

```typescript
async executeQuery(dbName: string, query: string, params: unknown[] = []): Promise<QueryResult> {
  const now = Date.now();
  const circuit = this.getCircuit(dbName);

  // Circuit breaker: fast-reject if OPEN
  const decision = shouldReject(circuit, now);
  if (decision.reject) {
    const retryIn = Math.ceil(decision.retryInMs / 1000);
    throw new CircuitOpenError(
      `Database '${dbName}' is currently unavailable — retry in ${retryIn}s`
    );
  }
  // Transition to HALF_OPEN if cooldown elapsed
  if (!decision.reject && decision.transitionTo === 'HALF_OPEN') {
    this.circuits.set(dbName, { ...circuit, status: 'HALF_OPEN' });
  }

  // Cache: check for SELECT hit
  if (this.queryCache) {
    const cached = this.queryCache.get(dbName, query, params);
    if (cached !== undefined) {
      this.metrics?.recordCacheHit(dbName);
      return { ...cached, _cached: true } as QueryResult;
    }
    if (this.queryCache.shouldCache(query)) {
      this.metrics?.recordCacheMiss(dbName);
    }
  }

  const start = Date.now();
  try {
    // ---- EXISTING executeQuery body goes here ----
    const result = await this._executeQueryInternal(dbName, query, params);
    // ---- END EXISTING BODY ----

    // Success path
    const updatedCircuit = recordSuccess(this.getCircuit(dbName));
    if (updatedCircuit.status !== this.getCircuit(dbName).status) {
      this.circuits.set(dbName, updatedCircuit);
      this.metrics?.recordCircuitEvent(dbName, 'closed');
    } else {
      this.circuits.set(dbName, updatedCircuit);
    }

    const durationMs = Date.now() - start;
    this.metrics?.recordQuery(dbName, durationMs, true);

    // Cache: store if cacheable
    const dbConfig = this.getDatabaseConfig(dbName);
    const ttl = (dbConfig as Record<string, unknown>)?.cache_ttl_seconds as number ?? 60;
    this.queryCache?.set(dbName, query, params, result, ttl);

    // Audit log if enabled
    const auditEnabled = (dbConfig as Record<string, unknown>)?.audit_log === true
      || (dbConfig as Record<string, unknown>)?.audit_log === 'true';
    if (auditEnabled) {
      writeAuditLog(dbName, query, durationMs, 'success').catch(() => {/* non-fatal */});
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - start;

    // Determine error category (reuse existing error classification if available)
    const category = this.classifyErrorCategory(err);
    const isInfraError = category === 'CONNECTION' || category === 'SSH';

    if (isInfraError) {
      const updatedCircuit = recordFailure(this.getCircuit(dbName), Date.now());
      if (updatedCircuit.status === 'OPEN' && this.getCircuit(dbName).status !== 'OPEN') {
        this.metrics?.recordCircuitEvent(dbName, 'open');
      }
      this.circuits.set(dbName, updatedCircuit);
    }

    this.metrics?.recordQuery(dbName, durationMs, false, category);

    const dbConfig = this.getDatabaseConfig(dbName);
    const auditEnabled = (dbConfig as Record<string, unknown>)?.audit_log === true
      || (dbConfig as Record<string, unknown>)?.audit_log === 'true';
    if (auditEnabled) {
      writeAuditLog(dbName, query, durationMs, `error:${category}`).catch(() => {/* non-fatal */});
    }

    throw err;
  }
}
```

**Note:** Rename the existing `executeQuery` body to `_executeQueryInternal` (private method), or inline the existing logic at the `// ---- EXISTING body ----` comment. Do NOT duplicate the existing logic — move it.

> **⚠️ Gotcha:** The existing `executeQuery` body is NOT just a single adapter call. It contains connection-lookup, reconnect-on-stale-connection, retry logic, and error transformation. `_executeQueryInternal` must capture ALL of this — do not reduce it to just `adapter.executeQuery(...)`. Read the full existing body at line 704 before extracting.

> **⚠️ Gotcha:** `getDatabaseConfig(dbName)` returns `DatabaseConfig | undefined`. Since Task 4 added `audit_log` and `cache_ttl_seconds` directly to `DatabaseConfig`, read them via the typed interface: `const dbConfig = this.getDatabaseConfig(dbName); const ttl = dbConfig?.cache_ttl_seconds ?? 60;`. No unsafe cast needed.

Also add `classifyErrorCategory` helper:
```typescript
private classifyErrorCategory(err: unknown): string {
  if (err instanceof CircuitOpenError) return 'CONNECTION';
  const name = (err as Error)?.name ?? '';
  if (name.includes('SSH') || name === 'SSHTunnelError') return 'SSH';
  if (name === 'ConnectionError') return 'CONNECTION';
  if (name === 'SecurityViolationError') return 'SECURITY';
  if (name === 'QueryExecutionError') return 'QUERY';
  if (name === 'TimeoutError') return 'TIMEOUT';
  return 'QUERY';
}
```

- [ ] **Step 7.4: Cache invalidation for mutations**

In `executeBatch` (line ~725), after each mutation query succeeds, call:
```typescript
if (this.queryCache?.isMutation(q.query)) {
  this.queryCache.invalidate(dbName);
}
```

- [ ] **Step 7.5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors (fix any that appear)

- [ ] **Step 7.6: Run existing connection manager tests**

```bash
npx jest tests/unit/connection-manager.test.ts --no-coverage 2>&1 | tail -20
```
Expected: All existing tests still pass

- [ ] **Step 7.7: Commit**

```bash
git add src/classes/ConnectionManager.ts
git commit -m "feat: integrate circuit breaker, query cache, and metrics into ConnectionManager.executeQuery"
```

---

## Task 8: sql_get_metrics MCP Tool

**Files:**
- Create: `src/tools/handlers/metrics-handlers.ts`
- Modify: `src/tools/handlers/types.ts`
- Modify: `src/tools/tool-definitions.ts`
- Modify: `src/tools/dispatcher.ts`

- [ ] **Step 8.1: Add metricsManager to ToolHandlerContext**

In `src/tools/handlers/types.ts`, add import and field:
```typescript
import type { MetricsManager } from '../../classes/MetricsManager.js';

export interface ToolHandlerContext {
  connectionManager: ConnectionManager;
  securityManager: SecurityManager;
  schemaManager: SchemaManager;
  sshTunnelManager: EnhancedSSHTunnelManager;
  metricsManager: MetricsManager;           // ← add this line
  config: ParsedServerConfig;
  configPath: string;
  logger: Logger;
}
```

- [ ] **Step 8.2: Create metrics handler**

```typescript
// src/tools/handlers/metrics-handlers.ts
import type { MCPToolResponse } from '../../types/index.js';
import type { ToolHandlerContext } from './types.js';

interface GetMetricsArgs {
  database?: string;
}

export async function handleGetMetrics(
  args: GetMetricsArgs,
  ctx: ToolHandlerContext
): Promise<MCPToolResponse> {
  const snapshot = ctx.metricsManager.getSnapshot(args.database);
  const text = JSON.stringify(snapshot, null, 2);
  return {
    content: [{ type: 'text', text }],
    _meta: { progressToken: null },
  };
}
```

- [ ] **Step 8.3: Add sql_get_metrics to tool-definitions.ts**

In `src/tools/tool-definitions.ts`, add to the array returned by `getToolDefinitions()`:

```typescript
{
  name: 'sql_get_metrics',
  description: 'Get in-memory performance metrics for configured databases. Returns query latency (min/max/avg/p95), error counts by category, circuit breaker state, cache hit rate, and pool utilization.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Optional database name. Omit to get metrics for all databases.',
      },
    },
    required: [],
  },
},
```

- [ ] **Step 8.4: Add sql_get_metrics case to dispatcher.ts**

In `src/tools/dispatcher.ts`, add the import:
```typescript
import { handleGetMetrics } from './handlers/metrics-handlers.js';
```

In the switch statement inside `createToolDispatcher`, add:
```typescript
case 'sql_get_metrics':
  return handleGetMetrics(args as { database?: string }, ctx);
```

- [ ] **Step 8.5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors

- [ ] **Step 8.6: Commit**

```bash
git add src/tools/handlers/metrics-handlers.ts src/tools/handlers/types.ts src/tools/tool-definitions.ts src/tools/dispatcher.ts
git commit -m "feat: add sql_get_metrics MCP tool exposing in-memory performance metrics"
```

---

## Task 9: Wire MetricsManager + QueryCache into SQLMCPServer

**Files:**
- Modify: `src/classes/SQLMCPServer.ts`

- [ ] **Step 9.1: Instantiate MetricsManager and QueryCache in SQLMCPServer**

Read `src/classes/SQLMCPServer.ts` first. Then:

Add imports at the top:
```typescript
import { MetricsManager } from './MetricsManager.js';
import { QueryCache } from './QueryCache.js';
```

Add private member variables:
```typescript
private metricsManager!: MetricsManager;
private queryCache!: QueryCache;
```

In `initializeManagers()` (or wherever `ConnectionManager` is instantiated), change:
```typescript
// Before:
this.connectionManager = new ConnectionManager(this.sshTunnelManager);

// After:
this.metricsManager = new MetricsManager();
this.queryCache = new QueryCache();
this.connectionManager = new ConnectionManager(
  this.sshTunnelManager,
  this.metricsManager,
  this.queryCache
);
```

- [ ] **Step 9.2: Pass metricsManager into tool dispatcher context**

Find where `createToolDispatcher` is called in SQLMCPServer (it returns `this.dispatchToolCall`). The context object passed to it needs `metricsManager`:

```typescript
this.dispatchToolCall = createToolDispatcher({
  connectionManager: this.connectionManager,
  securityManager: this.securityManager,
  schemaManager: this.schemaManager,
  sshTunnelManager: this.sshTunnelManager,
  metricsManager: this.metricsManager,    // ← add this
  config: this.config,
  configPath: this.configPath,
  logger: this.logger,
});
```

- [ ] **Step 9.3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors

- [ ] **Step 9.4: Run all unit tests**

```bash
npx jest tests/unit --no-coverage 2>&1 | tail -20
```
Expected: All tests pass

- [ ] **Step 9.5: Commit**

```bash
git add src/classes/SQLMCPServer.ts
git commit -m "feat: instantiate MetricsManager and QueryCache in SQLMCPServer and wire into ConnectionManager"
```

---

## Task 10: Type Safety Cleanup

**Files:**
- Modify: `src/database/adapters/mysql.ts`
- Modify: `src/database/adapters/postgresql.ts`
- Modify: `src/database/adapters/mssql.ts`

The goal is to remove `as unknown as DatabaseConnection` casts by using typed local consts (same pattern as the `d8577df` refactor).

- [ ] **Step 10.1: Fix mysql.ts type assertion**

Read `src/database/adapters/mysql.ts`. Find line 76 (`as unknown as DatabaseConnection`).

The pattern is: acquire a typed connection from the pool, then cast it to `DatabaseConnection`. Instead, use the correct MySQL pool connection type directly:

```typescript
// Before (line ~76):
return poolConnection as unknown as DatabaseConnection;

// After — declare the typed local:
const conn: mysql.PoolConnection = poolConnection;
return conn as DatabaseConnection;
// (mysql.PoolConnection IS a DatabaseConnection via the union type — verify in src/types/database.ts)
```

If the type union doesn't include `mysql.PoolConnection` directly, add it to `DatabaseConnection` in `src/types/database.ts`.

- [ ] **Step 10.2: Fix postgresql.ts type assertion**

Same approach in `src/database/adapters/postgresql.ts` at line ~64:
```typescript
const client: pg.PoolClient = poolClient;
return client as DatabaseConnection;
```

- [ ] **Step 10.3: Fix mssql.ts type assertions**

Read `src/database/adapters/mssql.ts`. Find and fix the connection casting using the same typed-local-const pattern.

- [ ] **Step 10.4: Fix remaining `any` types**

Find all explicit `any` annotations (tsc does not report these — use ESLint):
```bash
npx eslint src --ext .ts --rule '{"@typescript-eslint/no-explicit-any": "warn"}' 2>&1 | grep "no-explicit-any"
```

For each `any` in handler contexts: replace with `unknown` + type guard, or with the specific type from `src/types/`. Common fixes:
- Handler `args` parameter: use the typed arg interfaces already in `src/types/mcp.ts` (e.g. `SQLQueryArgs`)
- Config iteration: use `Record<string, string | number | boolean | undefined>`
- Any remaining casts: prefer `unknown` over `any` as the intermediate type

- [ ] **Step 10.5: Verify TypeScript compiles with no new errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors

- [ ] **Step 10.6: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```
Expected: All tests pass

- [ ] **Step 10.7: Commit**

```bash
git add src/database/adapters/mysql.ts src/database/adapters/postgresql.ts src/database/adapters/mssql.ts src/types/database.ts
git commit -m "refactor: remove type assertions in adapters, replace with typed local consts"
```

---

## Task 11: Extended Existing Tests

**Files:**
- Modify: `tests/unit/connection-manager.test.ts`
- Modify: `tests/unit/schema-manager.test.ts`
- Modify (or create): `tests/integration/ssh-tunnel.test.ts`

- [ ] **Step 11.1: Add pool exhaustion + circuit breaker tests to connection-manager.test.ts**

Read the existing `tests/unit/connection-manager.test.ts` (understand existing mock setup), then append a new describe block:

```typescript
describe('circuit breaker integration', () => {
  it('opens circuit after 5 consecutive CONNECTION errors', async () => {
    // Mock adapter to throw ConnectionError 5 times
    // Call executeQuery 5 times with CONNECTION errors
    // 6th call should throw CircuitOpenError without calling adapter
    // Verify adapter was called exactly 5 times
  });

  it('CircuitOpenError message includes retry time', async () => {
    // Open the circuit, then call executeQuery
    // Expect message to match /retry in \d+s/
  });

  it('QUERY errors do not advance circuit breaker', async () => {
    // Throw QueryExecutionError 10 times
    // Circuit should remain CLOSED
  });
});

describe('query cache integration', () => {
  it('returns cached result on second identical SELECT', async () => {
    // First call hits DB
    // Second identical call returns cache hit
    // Verify adapter called only once
  });

  it('does not cache mutations', async () => {
    // INSERT query called twice
    // Adapter called both times
  });
});
```

Follow the existing test file's mock patterns exactly (reuse the `mockSshTunnelManager` setup already in the file).

- [ ] **Step 11.2: Add schema refresh race condition test to schema-manager.test.ts**

Read `tests/unit/schema-manager.test.ts`, then append:

```typescript
describe('concurrent refresh deduplication', () => {
  it('fires only one refresh for concurrent sql_get_schema calls on same DB', async () => {
    let refreshCallCount = 0;
    // Mock the underlying refresh to be slow (fake timer or Promise delay)
    // Call refreshSchema twice concurrently
    // Verify refresh was only triggered once
    // Verify both callers received the same result
  });
});
```

- [ ] **Step 11.3: Add SSH tunnel tests**

In `tests/integration/ssh-tunnel.test.ts` (create if it doesn't exist, or extend), using the `ssh2` mock pattern from `tests/unit/connection-manager.test.ts`:

```typescript
describe('SSH tunnel', () => {
  it('throws ConfigurationError for world-readable key file', async () => {
    // Mock fs.stat to return mode 0o644 (world-readable)
    // Attempt to create tunnel with a key path
    // Expect ConfigurationError with 'world-readable' in message
  });

  it('throws SSHTunnelError on auth failure', async () => {
    // Mock ssh2 Client to emit 'error' with auth failure
    // Expect SSHTunnelError
  });

  it('fires timeout after 45s', async () => {
    jest.useFakeTimers();
    // Mock ssh2 Client that never connects
    // Advance timers by 45s
    // Expect timeout error
    jest.useRealTimers();
  });
});
```

- [ ] **Step 11.4: Run all new and extended tests**

```bash
npx jest tests/unit/connection-manager.test.ts tests/unit/schema-manager.test.ts tests/integration/ssh-tunnel.test.ts --no-coverage 2>&1 | tail -20
```
Expected: All pass (fix any failures before proceeding)

- [ ] **Step 11.5: Commit**

```bash
git add tests/unit/connection-manager.test.ts tests/unit/schema-manager.test.ts tests/integration/ssh-tunnel.test.ts
git commit -m "test: add circuit breaker, cache, schema race, and SSH tunnel coverage"
```

---

## Task 12: Final Build + Full Test Run

- [ ] **Step 12.1: Run full test suite with coverage**

```bash
npm run test:coverage 2>&1 | tail -30
```
Expected: All tests pass, coverage ≥ 85% (was 88% before — new code has tests, should hold)

- [ ] **Step 12.2: Run production build**

```bash
npm run build:production 2>&1 | tail -20
```
Expected: lint + tests + build all succeed

- [ ] **Step 12.3: Fix any remaining TypeScript or lint errors**

If `npm run build:production` fails:
- TypeScript errors: run `npx tsc --noEmit` for details
- Lint errors: run `npx eslint src --ext .ts` for details
- Test failures: run `npx jest --no-coverage` for details

Fix each category before re-running the full build.

- [ ] **Step 12.4: Final commit**

```bash
git status  # verify only expected files are modified/untracked
git add src/ tests/
git commit -m "chore: full spectrum audit — observability, circuit breaker, cache, type safety, security, tests"
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx tsc --noEmit` | Type check only |
| `npx jest tests/unit/<file> --no-coverage` | Run single test file |
| `npx jest --no-coverage` | All tests, no coverage overhead |
| `npm run test:coverage` | All tests with coverage report |
| `npm run build:production` | Lint + test + full build |

## Gotchas

- **ESM imports:** All local imports must use `.js` extension (e.g. `import ... from './MetricsManager.js'`), not `.ts`
- **ConnectionManager constructor change:** is backward-compatible (new args are optional) — existing tests don't need updating
- **Audit log is fire-and-forget:** `writeAuditLog(...).catch(() => {})` — never let a logging failure kill a query
- **`_cached` on QueryResult:** The `cached: true` metadata field — check if `QueryResult` type allows extra fields; if it uses strict interfaces, add `_cached?: boolean` to the type definition in `src/types/database.ts`
- **`cache_ttl_seconds` and `audit_log` in DatabaseConfig:** Task 4 adds these to the interface and `parseDatabaseConfig`. Make sure Task 4 runs before Tasks 5 and 7 (ordering matters).
- **`_executeQueryInternal` complexity:** The existing `executeQuery` body is not just one adapter call — it includes connection-lookup, stale-connection reconnect, and error transformation. Extract the full body, not just the adapter dispatch line.
- **`classifyErrorCategory` re-entrancy:** `CircuitOpenError extends ConnectionError`, so if a `CircuitOpenError` somehow enters the catch block of a new query (e.g. via a retry wrapper), it will be classified as `CONNECTION` and advance the circuit counter further. This is intentional — a rejected circuit counts as a connection unavailability — but be aware if you add retry logic later.
- **MapIterator strict mode:** `Map.keys().next().value` is typed `string | undefined` in TypeScript 5 strict mode. Always guard: `const k = map.keys().next().value; if (k !== undefined) map.delete(k);`
