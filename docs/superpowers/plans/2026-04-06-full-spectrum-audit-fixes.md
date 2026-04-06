# Full Spectrum Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all issues surfaced by the full-spectrum audit — security gaps, error handling, type safety, and performance.

**Architecture:** Eight focused tasks, ordered by risk (security first, then correctness, then performance). Each task is self-contained. No task breaks the public adapter interface. Connection pooling is the only structural change — it is backward-compatible because pool clients expose the same API as direct connections.

**Tech Stack:** TypeScript, Node.js, mysql2/promise pools, pg.Pool, ssh2, jest

---

## Task 1: Config file permission warning (security)

**Files:**
- Modify: `src/utils/config.ts:39-56`
- Test: `tests/unit/utils/config.test.ts`

- [ ] **Step 1: Write failing test**

Open `tests/unit/utils/config.test.ts` and add at the end of the describe block:

```ts
describe('loadConfiguration - permission warning', () => {
  it('logs a warning when config file is world-readable (mode 0o644)', () => {
    const tmpPath = '/tmp/test-config-perms.ini';
    fs.writeFileSync(tmpPath, '[database.test]\ntype=sqlite\nfile=test.db\n', 'utf-8');
    fs.chmodSync(tmpPath, 0o644);
    const warnSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadConfiguration(tmpPath);
    // Should have warned about world-readable file
    const warned = warnSpy.mock.calls.some(c => String(c[0]).includes('world-readable'));
    warnSpy.mockRestore();
    fs.unlinkSync(tmpPath);
    expect(warned).toBe(true);
  });

  it('does not warn when config file is owner-only (mode 0o600)', () => {
    const tmpPath = '/tmp/test-config-perms-ok.ini';
    fs.writeFileSync(tmpPath, '[database.test]\ntype=sqlite\nfile=test.db\n', 'utf-8');
    fs.chmodSync(tmpPath, 0o600);
    const warnSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadConfiguration(tmpPath);
    const warned = warnSpy.mock.calls.some(c => String(c[0]).includes('world-readable'));
    warnSpy.mockRestore();
    fs.unlinkSync(tmpPath);
    expect(warned).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="utils/config" 2>&1 | tail -20
```

Expected: FAIL — warning never emitted.

- [ ] **Step 3: Implement permission check in `loadConfiguration`**

In `src/utils/config.ts`, add `statSync` import:

```ts
import { readFileSync, existsSync, writeFileSync, statSync } from 'fs';
```

Place the permission check INSIDE the existing `try { readFileSync(...) }` block, immediately before `readFileSync`, so it is wrapped by the same error handler:

```ts
  try {
    // Warn if config file is group- or world-readable (mask 0o044 covers both)
    try {
      const stat = statSync(path);
      const mode = stat.mode & 0o777;
      if (mode & 0o044) {
        process.stderr.write(
          `WARNING: Config file ${path} is group- or world-readable ` +
          `(mode ${mode.toString(8).padStart(3, '0')}). ` +
          `It contains credentials. Run: chmod 600 ${path}\n`
        );
      }
    } catch {
      // statSync failure is non-fatal — proceed with load
    }

    const configContent = readFileSync(path, 'utf-8');
    const rawConfig = parseIni(configContent);
    return parseConfiguration(rawConfig);
  } catch (error) {
    throw new Error(`Failed to load configuration from ${path}: ${getErrorMessage(error)}`);
  }
```

Note: the test checks for the string `'world-readable'` — update the test string to match `'group- or world-readable'`:

```ts
const warned = warnSpy.mock.calls.some(c => String(c[0]).includes('group- or world-readable'));
```

- [ ] **Step 4: Run tests**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="utils/config" 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Build**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /root/sql-ts && git add src/utils/config.ts tests/unit/utils/config.test.ts
git commit -m "security: warn when config.ini is world-readable"
```

---

## Task 2: Block dangerous commands in non-SELECT mode (security)

**Files:**
- Modify: `src/classes/SecurityManager.ts:219-309`
- Test: `tests/unit/security-manager.test.ts`

**Context:** `validateAnyQuery` (used when `select_only=false`) skips the `blockedKeywords` check, so bare `EXEC sp_foo` or `CALL proc()` are allowed through. We need to block a hardcoded set of always-dangerous commands even in write mode.

- [ ] **Step 1: Write failing tests**

In `tests/unit/security-manager.test.ts`, add inside the existing describe block:

```ts
describe('validateAnyQuery - dangerous command blocking', () => {
  let manager: SecurityManager;
  beforeEach(() => { manager = new SecurityManager({}, false); }); // select_only=false

  it.each(['EXEC sp_foo', 'EXECUTE sp_foo', 'CALL my_proc()'])(
    'blocks %s even in non-SELECT mode',
    async (query) => {
      const result = await manager.validateQuery(query);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/not allowed/i);
    }
  );

  it('allows INSERT in non-SELECT mode', async () => {
    const result = await manager.validateQuery("INSERT INTO t(a) VALUES (1)");
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="security-manager" 2>&1 | tail -20
```

Expected: FAIL — EXEC/CALL are currently allowed.

- [ ] **Step 3: Add always-blocked set and first-token check to `validateAnyQuery`**

In `SecurityManager.ts`, add a new private field after `blockedKeywords`:

```ts
// Commands that are dangerous regardless of select_only mode
private readonly alwaysBlockedCommands = new Set<string>([
  'EXEC',
  'EXECUTE',
  'CALL',
  'LOAD',
  'IMPORT',
  'EXPORT',
  'BACKUP',
  'RESTORE',
]);
```

In `validateAnyQuery`, after the `tokens.length === 0` check and before the dangerous patterns check, add:

```ts
    // Block certain commands even in non-SELECT mode
    const firstToken = tokens.find((t) => t.type === 'KEYWORD');
    if (firstToken && this.alwaysBlockedCommands.has(firstToken.value.toUpperCase())) {
      return {
        allowed: false,
        reason: `Command '${firstToken.value.toUpperCase()}' is not allowed even in write mode`,
        blockedCommand: firstToken.value.toUpperCase(),
        confidence: 1.0,
      };
    }
```

- [ ] **Step 4: Run tests**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="security-manager" 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Build**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /root/sql-ts && git add src/classes/SecurityManager.ts tests/unit/security-manager.test.ts
git commit -m "security: block EXEC/CALL/stored procs in non-SELECT mode"
```

---

## Task 3: Fix empty catch block in EnhancedSSHTunnelManager (error handling)

**Files:**
- Modify: `src/classes/EnhancedSSHTunnelManager.ts:430-444`
- Test: `tests/unit/enhanced-ssh-tunnel.test.ts`

**Context:** The `checkPortAvailability` method has `} catch { // No suggestion available }` at ~line 439. Errors here are swallowed entirely with no trace.

- [ ] **Step 1: Write failing test**

In `tests/unit/enhanced-ssh-tunnel.test.ts`, add a test that mocks the portManager to throw and verifies the manager's logger.debug is called:

```ts
describe('checkPortAvailability - error logging', () => {
  it('logs debug message when port suggestion throws', async () => {
    // This validates the empty catch is replaced with a real log call.
    // If the method silently swallows errors, this test catches regressions.
    const manager = new EnhancedSSHTunnelManager();
    const debugSpy = jest.spyOn((manager as unknown as Record<string, unknown>).logger as { debug: jest.Mock }, 'debug');
    // Force portManager.isPortAvailable to return unavailable so suggestion path runs
    // Force portManager.findAvailablePort to throw
    const pm = (manager as unknown as Record<string, unknown>).portManager as Record<string, jest.Mock>;
    pm.isPortAvailable = jest.fn().mockResolvedValue({ isAvailable: false, reason: 'in use' });
    pm.findAvailablePort = jest.fn().mockRejectedValue(new Error('no ports'));
    await manager.checkPortAvailability(12345);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('suggest'),
      expect.objectContaining({ error: 'no ports' })
    );
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="enhanced-ssh" 2>&1 | tail -20
```

Expected: FAIL — no debug call occurs (empty catch).

- [ ] **Step 3: Read the surrounding context**

Read `src/classes/EnhancedSSHTunnelManager.ts` lines 415-445 before editing.

- [ ] **Step 4: Replace empty catch with logged warning**

Find the empty catch block in `checkPortAvailability`:

```ts
      } catch {
        // No suggestion available
      }
```

Replace with:

```ts
      } catch (err) {
        this.logger.debug('Could not suggest alternative port', {
          port,
          error: (err as Error).message,
        });
      }
```

- [ ] **Step 5: Verify no other empty catch blocks exist**

```bash
cd /root/sql-ts && grep -n "} catch {" src/classes/EnhancedSSHTunnelManager.ts
```

Fix any others found using the same pattern (log at debug level with context).

- [ ] **Step 6: Build and test**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -10 && npm test -- --testPathPattern="enhanced-ssh" 2>&1 | tail -20
```

Expected: build succeeds, tests pass.

- [ ] **Step 7: Commit**

```bash
cd /root/sql-ts && git add src/classes/EnhancedSSHTunnelManager.ts tests/unit/enhanced-ssh-tunnel.test.ts
git commit -m "fix: log swallowed errors in SSH port suggestion fallback"
```

---

## Task 4: Fix unsafe internal property access in isConnected (type safety)

**Files:**
- Modify: `src/classes/EnhancedSSHTunnelManager.ts` (isConnected method ~line 313)
- Modify: `src/database/adapters/postgresql.ts:66-78`

**Context:** Both use internal underscore properties (`_sock`, `_connected`) which are undocumented and can break on library updates. Use the public API instead.

- [ ] **Step 1: Fix SSH isConnected in EnhancedSSHTunnelManager**

Read lines 313-337 of `EnhancedSSHTunnelManager.ts` first.

Replace the try/catch block in `isConnected`:

```ts
    // Check if SSH connection is still active using the public EventEmitter API.
    // If listenerCount > 0 the client has active event handlers → it's alive.
    try {
      return !!(
        tunnel.connection &&
        tunnel.connection.listenerCount('error') > 0
      );
    } catch (error) {
      this.logger.debug(`Connection health check error for '${dbName}'`, {
        error: (error as Error).message,
      });
      return false;
    }
```

- [ ] **Step 2: Fix PostgreSQL isConnected**

Read `src/database/adapters/postgresql.ts` lines 66-78 first.

The replacement must reflect actual connection state — `typeof pgClient.query === 'function'` is wrong because a disconnected client still has that method. Instead check whether the underlying socket is still open via the public `connection.stream` path (typed in `@types/pg`):

```ts
  isConnected(connection: DatabaseConnection): boolean {
    try {
      const pgClient = connection as PgClient & {
        connection?: { stream?: { destroyed?: boolean; readable?: boolean } };
      };
      if (!pgClient?.connection?.stream) return false;
      return pgClient.connection.stream.destroyed !== true;
    } catch {
      return false;
    }
  }
```

This uses the `connection.stream` path (a public `net.Socket`) which is present in `@types/pg` and accurately reflects socket liveness without accessing underscore-prefixed private fields.

- [ ] **Step 3: Build and test**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd /root/sql-ts && git add src/classes/EnhancedSSHTunnelManager.ts src/database/adapters/postgresql.ts
git commit -m "fix: replace unsafe internal property access in isConnected checks"
```

---

## Task 5: Replace non-null assertions in adapters with local consts (type safety)

**Files:**
- Modify: `src/database/adapters/mysql.ts`
- Modify: `src/database/adapters/postgresql.ts`
- Modify: `src/database/adapters/mssql.ts`
- Modify: `src/database/adapters/sqlite.ts`

**Context:** After `validateConfig([...])` throws if fields are missing, using `this.config.host!` is technically safe but TypeScript can't verify it. Extract into local typed consts instead — removes `!`, makes intent clear, and catches regressions if `validateConfig` logic changes.

- [ ] **Step 1: Read each adapter's connect() method before editing**

Read the `connect()` method in each of the four files.

- [ ] **Step 2: Update mysql.ts connect()**

After `this.validateConfig(['host', 'database', 'username', 'password']);`, add:

```ts
    const host = this.config.host as string;
    const database = this.config.database as string;
    const username = this.config.username as string;
    const password = this.config.password as string;
```

Then replace all `this.config.host!`, `this.config.database!`, `this.config.username!`, `this.config.password!` in that method with `host`, `database`, `username`, `password`.

Also fix `this.config.database!` in `captureSchema` at the `createBaseSchema(...)` call (line ~175). Change it to `this.config.database ?? ''`. Do NOT touch lines 189 and 244 — they already use `this.config.database ?? ''` and are correct as-is.

- [ ] **Step 3: Apply same pattern to postgresql.ts**

Same as Step 2 for `PostgreSQLAdapter.connect()`.

- [ ] **Step 4: Apply same pattern to mssql.ts**

Read mssql.ts connect() first, then apply same pattern for its required fields.

- [ ] **Step 5: Apply same pattern to sqlite.ts**

SQLite only requires `file`. After `validateConfig(['file'])`, extract: `const file = this.config.file as string;` and use it instead of `this.config.file!`.

- [ ] **Step 6: Build and run all tests**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -15 && npm test 2>&1 | tail -20
```

Expected: zero TypeScript errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /root/sql-ts && git add src/database/adapters/mysql.ts src/database/adapters/postgresql.ts src/database/adapters/mssql.ts src/database/adapters/sqlite.ts
git commit -m "refactor: replace non-null assertions with typed local consts in adapters"
```

---

## Task 6: Make SSH tunnel bind address configurable (flexibility)

**Files:**
- Modify: `src/types/index.ts` (add `ssh_local_host` to `DatabaseConfig`)
- Modify: `src/utils/config.ts` (parse `ssh_local_host` field)
- Modify: `src/classes/EnhancedSSHTunnelManager.ts` (~line 602, hardcoded `'127.0.0.1'`)
- Test: `tests/unit/enhanced-ssh-tunnel.test.ts`

**Context:** `server.listen(localPort, '127.0.0.1', ...)` and `localHost: '127.0.0.1'` are hardcoded. This blocks IPv6-only and Docker/container environments.

- [ ] **Step 1: Find all hardcoded '127.0.0.1' references**

```bash
cd /root/sql-ts && grep -n "127\.0\.0\.1" src/classes/EnhancedSSHTunnelManager.ts
```

Note all line numbers.

- [ ] **Step 2: Add `ssh_local_host` to DatabaseConfig type**

In `src/types/index.ts`, find the `DatabaseConfig` interface and add:

```ts
  ssh_local_host?: string;  // SSH tunnel listen address (default: '127.0.0.1')
```

- [ ] **Step 3: Parse `ssh_local_host` in config.ts**

In `parseSSHConfig()` in `src/utils/config.ts`, after the `ssh_passphrase` assignment, add:

```ts
  dbConfig.ssh_local_host = config.ssh_local_host || '127.0.0.1';
```

- [ ] **Step 4: Use `ssh_local_host` in EnhancedSSHTunnelManager**

In `createTunnel`, the `SSHTunnelCreateOptions` is built from `DatabaseConfig`. Ensure it passes through `ssh_local_host`.

In the `server.listen(...)` call (line ~602):

```ts
        const bindAddress = options.localHost ?? '127.0.0.1';
        server.listen(localPort, bindAddress, () => {
          // ...
          const enhancedTunnelInfo: EnhancedTunnelInfo = {
            // ...
            localHost: bindAddress,
```

- [ ] **Step 5: Build and test**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -10 && npm test -- --testPathPattern="enhanced-ssh" 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /root/sql-ts && git add src/types/index.ts src/utils/config.ts src/classes/EnhancedSSHTunnelManager.ts
git commit -m "feat: make SSH tunnel bind address configurable via ssh_local_host"
```

---

## Task 7: MySQL connection pooling (performance)

**Files:**
- Modify: `src/database/adapters/mysql.ts`
- Test: `tests/unit/adapters/mysql-adapter.test.ts`

**Context:** Currently `connect()` calls `mysql.createConnection()` every time — no reuse. `mysql2/promise` supports `createPool()` where `pool.getConnection()` returns a pooled `PoolConnection` that has all the same methods plus `.release()`. The adapter interface does not change.

- [ ] **Step 1: Write a failing test for pool reuse**

In `tests/unit/adapters/mysql-adapter.test.ts`, add:

```ts
describe('MySQLAdapter - connection pooling', () => {
  it('returns pool connections (has release method)', async () => {
    // This test verifies the adapter uses a pool by checking the connection has .release()
    const adapter = new MySQLAdapter({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'test',
      username: 'root',
      password: 'test',
      select_only: true,
      mcp_configurable: false,
    });
    // Mock the pool
    const mockRelease = jest.fn();
    const mockConn = { release: mockRelease, execute: jest.fn(), end: jest.fn() };
    const mockPool = { getConnection: jest.fn().mockResolvedValue(mockConn), end: jest.fn() };
    (adapter as unknown as Record<string, unknown>)._pool = mockPool;
    const conn = await adapter.connect();
    expect(conn).toBe(mockConn);
    await adapter.disconnect(conn);
    expect(mockRelease).toHaveBeenCalled();
    expect(mockConn.end).not.toHaveBeenCalled(); // pool client, not ended
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="mysql-adapter" 2>&1 | tail -20
```

- [ ] **Step 3: Add pool to MySQLAdapter**

Read `src/database/adapters/mysql.ts` fully before editing.

Add pool import and private field:

```ts
import type { Pool as MySQLPool, PoolConnection } from 'mysql2/promise';
```

Add field to class:

```ts
  private _pool?: MySQLPool;
```

Add a `getPool()` private method. **Important:** replicate the Azure MariaDB/MySQL special-case logic from the old `connect()` (forced SSL + `user@server` username rewriting for `.mariadb.database.azure.com` and `.mysql.database.azure.com` hosts):

```ts
  private getPool(): MySQLPool {
    if (!this._pool) {
      const host = this.config.host as string;
      const database = this.config.database as string;
      const username = this.config.username as string;
      const password = this.config.password as string;

      const poolConfig: mysql.PoolOptions = {
        host,
        port: this.parseConfigValue(this.config.port, 'number', 3306),
        database,
        user: username,
        password,
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: this.connectionTimeout,
      };

      // Handle SSL configuration
      if (this.config.ssl !== undefined) {
        const sslEnabled = this.parseConfigValue(this.config.ssl ?? false, 'boolean', false);
        if (sslEnabled) {
          const sslVerify = this.parseConfigValue(this.config.ssl_verify ?? false, 'boolean', false);
          poolConfig.ssl = { rejectUnauthorized: sslVerify };
        }
      }

      // Azure MariaDB/MySQL: force SSL and rewrite username to user@server
      if (
        host.includes('.mariadb.database.azure.com') ||
        host.includes('.mysql.database.azure.com')
      ) {
        const sslVerify = this.parseConfigValue(this.config.ssl_verify ?? false, 'boolean', false);
        poolConfig.ssl = { rejectUnauthorized: sslVerify };
        if (!username.includes('@')) {
          const serverName = host.split('.')[0];
          poolConfig.user = `${username}@${serverName}`;
        }
      }

      this._pool = mysql.createPool(poolConfig);
    }
    return this._pool;
  }
```

Replace `connect()` body:

```ts
  async connect(): Promise<DatabaseConnection> {
    this.validateConfig(['host', 'database', 'username', 'password']);
    try {
      const conn = await this.getPool().getConnection();
      return conn as unknown as DatabaseConnection;
    } catch (error) {
      throw this.createError('Failed to acquire MySQL connection from pool', error as Error);
    }
  }
```

Replace `disconnect()` body:

```ts
  async disconnect(connection: DatabaseConnection): Promise<void> {
    try {
      (connection as unknown as PoolConnection).release();
    } catch (error) {
      throw this.createError('Failed to release MySQL connection to pool', error as Error);
    }
  }
```

Add pool teardown method (called on server shutdown):

```ts
  async destroyPool(): Promise<void> {
    if (this._pool) {
      await this._pool.end();
      this._pool = undefined;
    }
  }
```

- [ ] **Step 4: Wire destroyPool() into server shutdown**

Read `src/index.ts` lines 44-78 (the graceful shutdown block) before editing.

In the shutdown handler, after the SSH tunnel cleanup and before the `process.exit()`, call `destroyPool()` on any MySQL adapters held by the connection manager. Look for the pattern where adapters are stored (likely `this.connectionManager` or `this.adapters`) and add:

```ts
// Destroy MySQL connection pools on shutdown
for (const adapter of Object.values(this.adapters ?? {})) {
  if (typeof (adapter as { destroyPool?: () => Promise<void> }).destroyPool === 'function') {
    await (adapter as { destroyPool: () => Promise<void> }).destroyPool();
  }
}
```

The exact location depends on how adapters are stored in `index.ts` — read the file first.

- [ ] **Step 5: Run tests and build**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -15 && npm test -- --testPathPattern="mysql-adapter" 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /root/sql-ts && git add src/database/adapters/mysql.ts tests/unit/adapters/mysql-adapter.test.ts src/index.ts
git commit -m "perf: add MySQL connection pooling via mysql2 createPool"
```

---

## Task 8: PostgreSQL connection pooling (performance)

**Files:**
- Modify: `src/database/adapters/postgresql.ts`
- Test: `tests/unit/adapters/postgresql-adapter.test.ts`

**Context:** Same as Task 7 but for `pg`. `pg.Pool` exposes `pool.connect()` returning a `PoolClient` with a `.release()` method. All query methods are identical to `pg.Client`.

- [ ] **Step 1: Write a failing test**

In `tests/unit/adapters/postgresql-adapter.test.ts`, mirror the mysql pooling test:

```ts
describe('PostgreSQLAdapter - connection pooling', () => {
  it('returns pool clients (has release method)', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: 'postgres',
      password: 'test',
      select_only: true,
      mcp_configurable: false,
    });
    const mockRelease = jest.fn();
    const mockClient = { release: mockRelease, query: jest.fn(), end: jest.fn() };
    const mockPool = { connect: jest.fn().mockResolvedValue(mockClient), end: jest.fn() };
    (adapter as unknown as Record<string, unknown>)._pool = mockPool;
    const conn = await adapter.connect();
    expect(conn).toBe(mockClient);
    await adapter.disconnect(conn);
    expect(mockRelease).toHaveBeenCalled();
    expect(mockClient.end).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="postgresql-adapter" 2>&1 | tail -20
```

- [ ] **Step 3: Add pool to PostgreSQLAdapter**

Read `src/database/adapters/postgresql.ts` fully before editing.

Add import:

```ts
import type { PoolClient } from 'pg';
```

Add field to class:

```ts
  private _pool?: pg.Pool;
```

Add `getPool()` private method:

```ts
  private getPool(): pg.Pool {
    if (!this._pool) {
      const host = this.config.host as string;
      const database = this.config.database as string;
      const username = this.config.username as string;
      const password = this.config.password as string;

      const poolConfig: pg.PoolConfig = {
        host,
        port: this.parseConfigValue(this.config.port, 'number', 5432),
        database,
        user: username,
        password,
        max: 10,
        connectionTimeoutMillis: this.connectionTimeout,
      };

      // SSL config — mirror the same branches as the old connect() to avoid behavior change
      if (this.config.ssl !== undefined) {
        const sslEnabled = this.parseConfigValue(this.config.ssl, 'boolean', false);
        if (sslEnabled) {
          const sslVerify = this.parseConfigValue(this.config.ssl_verify ?? false, 'boolean', false);
          poolConfig.ssl = { rejectUnauthorized: sslVerify };
        } else {
          poolConfig.ssl = false as unknown as pg.PoolConfig['ssl']; // explicitly disable
        }
      }

      this._pool = new pg.Pool(poolConfig);
    }
    return this._pool;
  }
```

Replace `connect()`:

```ts
  async connect(): Promise<DatabaseConnection> {
    this.validateConfig(['host', 'database', 'username', 'password']);
    try {
      const client = await this.getPool().connect();
      return client as unknown as DatabaseConnection;
    } catch (error) {
      throw this.createError('Failed to acquire PostgreSQL connection from pool', error as Error);
    }
  }
```

Replace `disconnect()`:

```ts
  async disconnect(connection: DatabaseConnection): Promise<void> {
    try {
      (connection as unknown as PoolClient).release();
    } catch (error) {
      throw this.createError('Failed to release PostgreSQL connection to pool', error as Error);
    }
  }
```

Add teardown:

```ts
  async destroyPool(): Promise<void> {
    if (this._pool) {
      await this._pool.end();
      this._pool = undefined;
    }
  }
```

- [ ] **Step 4: Wire destroyPool() into server shutdown**

In `src/index.ts` shutdown handler, add the same pool teardown loop as in Task 7 Step 4 (already done if Task 7 was completed first — verify it covers PostgreSQL adapters too, since the loop uses duck-typing on `destroyPool`).

- [ ] **Step 5: Run full test suite and build**

```bash
cd /root/sql-ts && npm run build 2>&1 | tail -15 && npm test 2>&1 | tail -30
```

Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd /root/sql-ts && git add src/database/adapters/postgresql.ts tests/unit/adapters/postgresql-adapter.test.ts
git commit -m "perf: add PostgreSQL connection pooling via pg.Pool"
```

---

## Final Verification

- [ ] **Run full build + test suite**

```bash
cd /root/sql-ts && npm run build:production 2>&1 | tail -30
```

Expected: lint clean, type-check clean, all tests pass.

- [ ] **Verify security fixes with grep**

```bash
cd /root/sql-ts && grep -n "world-readable" src/utils/config.ts && grep -n "alwaysBlockedCommands" src/classes/SecurityManager.ts
```

Both should return matches.

- [ ] **Verify no regressions in adapter interface**

```bash
cd /root/sql-ts && npm test -- --testPathPattern="adapters" 2>&1 | tail -30
```
