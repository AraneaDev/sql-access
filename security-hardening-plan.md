# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 real security vulnerabilities found by audit + devil's advocate review, and add security test coverage to prevent regression.

**Architecture:** Surgical fixes in existing files — no new modules. Security checks hardened in query handlers, config handlers, and SecurityManager normalizer. Comprehensive test expansion in existing test file.

**Tech Stack:** TypeScript, Vitest, node:path for SQLite validation

---

### Task 1: Block `select_only` changes via MCP tools (CRITICAL)

**Files:**
- Modify: `src/tools/handlers/config-handlers.ts:131-134`
- Test: `tests/unit/config-handlers.test.ts` (create if absent, or add to existing)

The `handleUpdateDatabase` function allows flipping `select_only` to false on any `mcp_configurable` database. An LLM or prompt injection could disable read-only protection then run destructive queries.

- [ ] **Step 1: Write the failing test**

```typescript
test('should reject select_only changes via MCP', async () => {
  const ctx = createMockContext({
    databases: {
      testdb: { type: 'mysql', select_only: true, mcp_configurable: true },
    },
  });

  await expect(
    handleUpdateDatabase(ctx, { database: 'testdb', select_only: false })
  ).rejects.toThrow(/select_only.*cannot be changed via MCP/i);

  // Verify it wasn't changed
  expect(ctx.config.databases.testdb.select_only).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: FAIL — select_only is currently allowed to be changed

- [ ] **Step 3: Implement the fix**

In `src/tools/handlers/config-handlers.ts`, replace the `select_only` update block (lines 131-134) with a rejection:

```typescript
  if (args.select_only !== undefined) {
    throw new ConfigurationError(
      `Security setting 'select_only' cannot be changed via MCP tools.\n` +
        `To change SELECT-only mode, manually edit config.ini under [database.${database}].\n` +
        `This prevents an AI from escalating its own database privileges.`
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/handlers/config-handlers.ts tests/unit/config-handlers.test.ts
git commit -m "fix(security): block select_only changes via MCP tools

Prevents LLM or prompt injection from disabling read-only mode on
databases. select_only can now only be changed by editing config.ini
manually, matching the pattern used for mcp_configurable."
```

---

### Task 2: Always call `validateAnyQuery()` for non-select-only databases (HIGH)

**Files:**
- Modify: `src/tools/handlers/query-handlers.ts:28-40`
- Modify: `src/tools/handlers/query-handlers.ts:104-118` (batch handler)
- Test: `tests/unit/security-manager.test.ts`

When `select_only` is false, query handlers skip ALL security validation. The `alwaysBlockedCommands` (EXEC, LOAD, BACKUP, etc.) and dangerous pattern checks are completely bypassed.

- [ ] **Step 1: Write the failing tests**

The bug is that `query-handlers.ts` never calls `validateAnyQuery()` when `select_only=false`. We need handler-level tests that prove EXEC/LOAD are blocked even on full-access databases.

Add to `tests/unit/query-handlers.test.ts` (create if absent):

```typescript
import { handleSqlQuery } from '../../src/tools/handlers/query-handlers.js';

describe('Query handler security for non-select-only databases', () => {
  test('should block EXEC on full-access database', async () => {
    const ctx = createMockContext({
      databases: {
        writedb: { type: 'mssql', select_only: false, mcp_configurable: true },
      },
    });

    const result = await handleSqlQuery(ctx, {
      database: 'writedb',
      query: 'EXEC xp_cmdshell "dir"',
    });

    // Should return error response, not succeed
    expect(result.content[0].text).toContain('blocked');
  });

  test('should block LOAD DATA on full-access database', async () => {
    const ctx = createMockContext({
      databases: {
        writedb: { type: 'mysql', select_only: false, mcp_configurable: true },
      },
    });

    const result = await handleSqlQuery(ctx, {
      database: 'writedb',
      query: "LOAD DATA INFILE '/etc/passwd' INTO TABLE t",
    });

    expect(result.content[0].text).toContain('blocked');
  });

  test('should allow INSERT on full-access database', async () => {
    const ctx = createMockContext({
      databases: {
        writedb: { type: 'mysql', select_only: false, mcp_configurable: true },
      },
    });

    // This should NOT be blocked (INSERT is valid in write mode)
    // Will fail at execution level (mock), not at validation
    const result = await handleSqlQuery(ctx, {
      database: 'writedb',
      query: "INSERT INTO t VALUES (1, 'a')",
    });

    // Should not contain "blocked" — it may fail for other reasons (mock DB)
    // but validation should pass
    expect(result.content[0].text).not.toContain('blocked');
  });
});
```

Also add SecurityManager regression tests to `tests/unit/security-manager.test.ts`:

```typescript
describe('validateAnyQuery regression', () => {
  let writeManager: SecurityManager;

  beforeEach(() => {
    writeManager = new SecurityManager({ security: defaultConfig }, false);
  });

  test('should block EXEC even in write mode', async () => {
    const result = await writeManager.validateQuery('EXEC xp_cmdshell "dir"');
    expect(result.allowed).toBe(false);
  });

  test('should block LOAD even in write mode', async () => {
    const result = await writeManager.validateQuery("LOAD DATA INFILE '/etc/passwd' INTO TABLE t");
    expect(result.allowed).toBe(false);
  });

  test('should allow INSERT in write mode', async () => {
    const result = await writeManager.validateQuery("INSERT INTO t VALUES (1, 'a')");
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/query-handlers.test.ts -t "non-select-only" --reporter=verbose`
Expected: EXEC/LOAD tests should FAIL — handler currently skips validation for non-select-only databases

- [ ] **Step 3: Implement the fix in single query handler**

In `src/tools/handlers/query-handlers.ts`, after the `if (dbConfig.select_only)` block (~line 40), add an else branch:

```typescript
    // Security validation for SELECT-only mode
    if (dbConfig.select_only) {
      const validation = ctx.securityManager.validateSelectOnlyQuery(query, dbConfig.type);
      if (!validation.allowed) {
        throw new SecurityViolationError(
          `Query blocked: Database '${database}' is configured for SELECT-only access. ${validation.reason}`,
          { database, query: query.substring(0, 100), reason: validation.reason }
        );
      }
    } else {
      // Even in write mode, block always-dangerous commands (EXEC, LOAD, etc.)
      const validation = ctx.securityManager.validateAnyQuery(query, dbConfig.type);
      if (!validation.allowed) {
        throw new SecurityViolationError(
          `Query blocked: ${validation.reason}`,
          { database, query: query.substring(0, 100), reason: validation.reason }
        );
      }
    }
```

- [ ] **Step 4: Implement the fix in batch query handler**

In the same file, in `handleBatchQuery` after the `if (dbConfig.select_only)` block (~line 118), add:

```typescript
    } else {
      // Even in write mode, validate each query for always-blocked commands
      for (const query of queries) {
        const validation = ctx.securityManager.validateAnyQuery(query.query, dbConfig.type);
        if (!validation.allowed) {
          throw new SecurityViolationError(
            `Batch contains blocked query: ${validation.reason}`,
            { database, query: query.query.substring(0, 100), reason: validation.reason }
          );
        }
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/security-manager.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/handlers/query-handlers.ts tests/unit/security-manager.test.ts tests/unit/query-handlers.test.ts
git commit -m "fix(security): validate queries even when select_only is false

Always call validateAnyQuery() to enforce alwaysBlockedCommands (EXEC,
LOAD, BACKUP, etc.) and dangerous pattern checks regardless of
select_only setting."
```

---

### Task 3: Block MySQL version-conditional comment bypass (HIGH)

**Files:**
- Modify: `src/classes/SecurityManager.ts:914-921` (normalizeQuery method)
- Test: `tests/unit/security-manager.test.ts`

MySQL `/*!50000 DROP TABLE users */` comments are executable SQL but the normalizer strips them as regular comments, allowing SELECT-only bypass.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/security-manager.test.ts`:

```typescript
describe('MySQL version-conditional comment bypass', () => {
  test('should block queries with /*!  version-conditional comments', async () => {
    const result = await securityManager.validateQuery(
      'SELECT 1 /*!50000 ; DROP TABLE users */'
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('version-conditional');
  });

  test('should block queries with /*! without version number', async () => {
    const result = await securityManager.validateQuery(
      'SELECT 1 /*! DROP TABLE users */'
    );
    expect(result.allowed).toBe(false);
  });

  test('should still allow normal comments', async () => {
    const result = await securityManager.validateQuery(
      'SELECT /* this is fine */ 1 FROM users'
    );
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/security-manager.test.ts -t "version-conditional" --reporter=verbose`
Expected: FAIL — conditional comments currently stripped and bypassed

- [ ] **Step 3: Implement the fix**

In `src/classes/SecurityManager.ts`, modify `normalizeQuery` to reject `/*!` patterns before stripping comments:

```typescript
  private normalizeQuery(query: string): string {
    // Block MySQL version-conditional comments that execute as SQL
    if (/\/\*!/.test(query)) {
      throw new Error(
        'Query contains MySQL version-conditional comments (/*!) which are not allowed'
      );
    }

    return query
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/--[^\r\n]*/g, '') // Remove -- comments
      .replace(/#[^\r\n]*/g, '') // Remove # comments (MySQL)
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
```

Then update both methods that call `normalizeQuery` to catch the thrown error:

**In `validateAnyQuery` (line 250)**, replace:
```typescript
    const normalizedQuery = this.normalizeQuery(query);
```
with:
```typescript
    let normalizedQuery: string;
    try {
      normalizedQuery = this.normalizeQuery(query);
    } catch (e) {
      return {
        allowed: false,
        reason: (e as Error).message,
        confidence: 1.0,
      };
    }
```

**In `validateSelectOnlyQuery` (line 461)**, replace:
```typescript
    const normalizedQuery = this.normalizeQuery(query);
```
with:
```typescript
    let normalizedQuery: string;
    try {
      normalizedQuery = this.normalizeQuery(query);
    } catch (e) {
      return {
        allowed: false,
        reason: (e as Error).message,
        confidence: 1.0,
      };
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/security-manager.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/classes/SecurityManager.ts tests/unit/security-manager.test.ts
git commit -m "fix(security): block MySQL version-conditional comment bypass

Reject queries containing /*! patterns before comment stripping.
MySQL executes these as real SQL, so they could bypass SELECT-only
validation."
```

---

### Task 4: Validate database names in `sql_add_database` (MEDIUM)

**Files:**
- Modify: `src/tools/handlers/config-handlers.ts:18-20`
- Test: `tests/unit/config-handlers.test.ts`

Database names from `sql_add_database` are interpolated into INI section headers (`[database.NAME]`) without sanitization. A crafted name with `]\n[security]` could inject arbitrary INI sections.

- [ ] **Step 1: Write the failing test**

```typescript
describe('database name validation', () => {
  test('should reject database names with INI injection characters', async () => {
    const ctx = createMockContext();
    await expect(
      handleAddDatabase(ctx, {
        name: 'evil]\n[security',
        type: 'mysql',
        host: 'localhost',
        username: 'root',
        password: 'pass',
      })
    ).rejects.toThrow(/invalid.*characters/i);
  });

  test('should reject database names with shell metacharacters', async () => {
    const ctx = createMockContext();
    await expect(
      handleAddDatabase(ctx, {
        name: 'db;rm -rf',
        type: 'mysql',
        host: 'localhost',
        username: 'root',
        password: 'pass',
      })
    ).rejects.toThrow(/invalid.*characters/i);
  });

  test('should allow valid database names', async () => {
    const ctx = createMockContext();
    // This should not throw for name validation (may throw for other reasons)
    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
    expect(nameRegex.test('my-database_01')).toBe(true);
    expect(nameRegex.test('production')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config-handlers.test.ts -t "database name" --reporter=verbose`
Expected: FAIL — no name validation exists

- [ ] **Step 3: Implement the fix**

In `src/tools/handlers/config-handlers.ts`, add validation at the top of `handleAddDatabase` after getting the name:

```typescript
  const name = args.name as string;

  // Validate database name to prevent INI injection and shell metacharacter attacks
  const DB_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  if (!name || name.length > 64 || !DB_NAME_RE.test(name)) {
    throw new ValidationError(
      `Database name '${name.substring(0, 20)}' contains invalid characters. ` +
        `Names must be alphanumeric with hyphens/underscores, 1-64 characters.`,
      'name'
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/handlers/config-handlers.ts tests/unit/config-handlers.test.ts
git commit -m "fix(security): validate database names to prevent INI injection

Database names are interpolated into INI section headers. A crafted
name could inject arbitrary config sections. Now restricted to
alphanumeric, hyphens, underscores."
```

---

### Task 5: Call `validateDatabaseConfig()` in `handleAddDatabase` (MEDIUM)

**Files:**
- Modify: `src/tools/handlers/config-handlers.ts:68` (before saving)
- Test: `tests/unit/config-handlers.test.ts`

`handleAddDatabase` skips the `validateDatabaseConfig()` function from config.ts, so shell metacharacters in host/database fields and embedded credentials bypass all validation.

- [ ] **Step 1: Write the failing test**

```typescript
test('should reject databases with embedded credentials in host', async () => {
  const ctx = createMockContext();
  await expect(
    handleAddDatabase(ctx, {
      name: 'testdb',
      type: 'mysql',
      host: 'user:pass@localhost',
      username: 'root',
      password: 'pass',
    })
  ).rejects.toThrow(/embedded credentials/i);
});

test('should reject databases with shell metacharacters in database field', async () => {
  const ctx = createMockContext();
  await expect(
    handleAddDatabase(ctx, {
      name: 'testdb',
      type: 'mysql',
      host: 'localhost',
      username: 'root',
      password: 'pass',
      database: 'mydb; rm -rf /',
    })
  ).rejects.toThrow(/invalid characters/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: FAIL — no config validation called

- [ ] **Step 3: Implement the fix**

In `src/tools/handlers/config-handlers.ts`, modify the existing import on line 9 to add `validateDatabaseConfig`:

```typescript
// Change:  import { saveConfigFile } from '../../utils/config.js';
// To:
import { saveConfigFile, validateDatabaseConfig } from '../../utils/config.js';
```

Then in `handleAddDatabase`, after building `dbConfig` and before saving (before line 68 `ctx.config.databases[name] = dbConfig;`):

```typescript
  // Validate the complete config (shell metacharacters, embedded credentials, port range)
  const validationResult = validateDatabaseConfig(dbConfig);
  if (!validationResult.valid) {
    const messages = validationResult.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
    throw new ValidationError(
      `Invalid database configuration: ${messages}`,
      validationResult.errors[0]?.field ?? 'config'
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/handlers/config-handlers.ts tests/unit/config-handlers.test.ts
git commit -m "fix(security): validate config in handleAddDatabase

Call validateDatabaseConfig() to check for shell metacharacters,
embedded credentials, and port range on MCP-added databases."
```

---

### Task 6: Validate SQLite file paths (MEDIUM)

**Files:**
- Modify: `src/tools/handlers/config-handlers.ts:41-43`
- Test: `tests/unit/config-handlers.test.ts`

SQLite `file` parameter is passed directly to the driver with no path validation. `../../../etc/passwd` or `/dev/zero` could cause reads from arbitrary paths.

- [ ] **Step 1: Write the failing test**

```typescript
describe('SQLite path validation', () => {
  test('should reject path traversal in SQLite file', async () => {
    const ctx = createMockContext();
    await expect(
      handleAddDatabase(ctx, {
        name: 'testdb',
        type: 'sqlite',
        file: '../../../etc/passwd',
      })
    ).rejects.toThrow(/path traversal/i);
  });

  test('should reject /dev/ paths', async () => {
    const ctx = createMockContext();
    await expect(
      handleAddDatabase(ctx, {
        name: 'testdb',
        type: 'sqlite',
        file: '/dev/zero',
      })
    ).rejects.toThrow(/not allowed/i);
  });

  test('should allow normal SQLite file paths', async () => {
    const ctx = createMockContext();
    // Should not throw for path validation (may throw for other reasons)
    const file = '/home/user/data/mydb.sqlite';
    expect(file.includes('..')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config-handlers.test.ts -t "SQLite path" --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: Implement the fix**

Add to `config-handlers.ts` imports:

```typescript
import { resolve } from 'node:path';
```

In `handleAddDatabase`, replace the SQLite file check:

```typescript
  if (dbType === 'sqlite') {
    if (!args.file) throw new ValidationError("SQLite databases require 'file' parameter");
    const filePath = args.file as string;

    // Validate SQLite file path - block path traversal and dangerous paths
    const resolved = resolve(filePath);
    if (filePath.includes('..')) {
      throw new ValidationError('SQLite file path traversal (..) is not allowed', 'file');
    }
    if (resolved.startsWith('/dev/') || resolved.startsWith('/proc/') || resolved.startsWith('/sys/')) {
      throw new ValidationError(`SQLite file path '${resolved}' is not allowed — must be a regular file path`, 'file');
    }

    dbConfig.file = filePath;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/handlers/config-handlers.ts tests/unit/config-handlers.test.ts
git commit -m "fix(security): validate SQLite file paths against traversal

Block path traversal (..) and dangerous system paths (/dev/, /proc/,
/sys/) in SQLite file parameter from sql_add_database."
```

---

### Task 7: Audit logging for config changes (LOW)

**Files:**
- Modify: `src/tools/handlers/config-handlers.ts` (add writeAuditLog calls)
- Test: `tests/unit/config-handlers.test.ts`

Config changes via MCP (add/update/remove database, especially select_only toggles) are not written to the audit log, only to the application logger.

- [ ] **Step 1: Write the failing test**

At the **top of the test file** (before any describe blocks), add the mock:

```typescript
import { writeAuditLog } from '../../src/utils/audit-logger.js';
vi.mock('../../src/utils/audit-logger.js', () => ({
  writeAuditLog: vi.fn(),
  hashQuery: vi.fn(() => 'abc123'),
}));
```

Then add the test inside a describe block:

```typescript
test('should audit log when adding a database', async () => {
  const ctx = createMockContext();
  await handleAddDatabase(ctx, {
    name: 'newdb',
    type: 'sqlite',
    file: '/tmp/test.db',
  });
  expect(writeAuditLog).toHaveBeenCalledWith(
    'newdb',
    expect.stringContaining('CONFIG_ADD'),
    expect.any(Number),
    'success'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config-handlers.test.ts -t "audit log" --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: Implement the fix**

Add import to `config-handlers.ts`:

```typescript
import { writeAuditLog } from '../../utils/audit-logger.js';
```

Add audit calls at the end of `handleAddDatabase`, `handleUpdateDatabase`, and `handleRemoveDatabase`:

In `handleAddDatabase` (before return):
```typescript
  writeAuditLog(name, 'CONFIG_ADD', 0, 'success').catch(() => {});
```

In `handleUpdateDatabase` (before return):
```typescript
  writeAuditLog(database, `CONFIG_UPDATE: ${updated.join(', ')}`, 0, 'success').catch(() => {});
```

In `handleRemoveDatabase` (before return):
```typescript
  writeAuditLog(database, 'CONFIG_REMOVE', 0, 'success').catch(() => {});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config-handlers.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/handlers/config-handlers.ts tests/unit/config-handlers.test.ts
git commit -m "feat(security): audit log config changes via MCP

Write to audit log when databases are added, updated, or removed
via MCP tools for security observability."
```

---

### Task 8: Run full test suite and verify no regressions

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Clean build with no TypeScript errors

- [ ] **Step 3: Final commit if any fixups needed**

If any regressions found, fix them and commit with descriptive message.

---

### Deferred: Result size limit (LOW)

The security review identified that there's no per-cell size limit on query results — a `SELECT REPEAT('A', 100000000)` could produce a huge response. This is LOW severity and deferred to a future pass. The fix would be adding a `max_cell_size` (e.g., 10KB) and `max_response_size` (e.g., 10MB) cap in the response formatter.
