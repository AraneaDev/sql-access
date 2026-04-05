# Test Coverage Plan: Raise to Industry Standards

## Target Thresholds

| Metric     | Current | Target | Industry Standard |
|------------|---------|--------|-------------------|
| Statements | 50%     | 80%    | 80%+              |
| Branches   | 38%     | 70%    | 70%+              |
| Functions  | 57%     | 80%    | 80%+              |
| Lines      | 51%     | 80%    | 80%+              |

No exclusions. All `src/**/*.ts` files collected (except entry points `index.ts`, `install.ts`, `setup.ts` and `setup/**` which are CLI scripts, not library code).

---

## Current Coverage by File (Sorted by Priority)

### Critical (< 15% lines) - Phase 1
| File | Stmts | Branch | Funcs | Lines | Effort |
|------|-------|--------|-------|-------|--------|
| `utils/config.ts` | 3% | 0% | 0% | 3% | Medium |
| `tools/handlers/config-handlers.ts` | 4% | 0% | 0% | 4% | Medium |
| `tools/handlers/schema-handlers.ts` | 4% | 0% | 0% | 4% | Medium |
| `utils/error-handler.ts` | 12% | 4% | 17% | 12% | Medium |
| `classes/EnhancedSSHTunnelManager.ts` | 14% | 2% | 14% | 13% | High |

### Low (15-50% lines) - Phase 2
| File | Stmts | Branch | Funcs | Lines | Effort |
|------|-------|--------|-------|-------|--------|
| `tools/dispatcher.ts` | 26% | 7% | 100% | 26% | Low |
| `tools/handlers/query-handlers.ts` | 28% | 12% | 33% | 27% | Medium |
| `utils/response-formatter.ts` | 31% | 15% | 50% | 35% | Low |
| `utils/logger.ts` | 40% | 39% | 46% | 40% | Low |
| `classes/ConnectionManager.ts` | 47% | 33% | 51% | 48% | High |

### Medium (50-80% lines) - Phase 3
| File | Stmts | Branch | Funcs | Lines | Effort |
|------|-------|--------|-------|-------|--------|
| `database/adapters/index.ts` | 59% | 52% | 67% | 60% | Low |
| `classes/SecurityManager.ts` | 65% | 53% | 64% | 64% | Medium |
| `classes/SQLMCPServer.ts` | 64% | 37% | 51% | 64% | Medium |
| `database/adapters/sqlite.ts` | 69% | 65% | 77% | 69% | Low |
| `classes/RedactionManager.ts` | 71% | 62% | 84% | 74% | Low |
| `database/adapters/base.ts` | 81% | 71% | 75% | 81% | Low |

### Already Good (80%+ lines) - Phase 4 (Polish)
| File | Stmts | Branch | Funcs | Lines |
|------|-------|--------|-------|-------|
| `classes/SchemaManager.ts` | 95% | 82% | 91% | 95% |
| `utils/port-manager.ts` | 94% | 83% | 100% | 95% |
| `database/adapters/mssql.ts` | 100% | 96% | 100% | 100% |
| `database/adapters/mysql.ts` | 100% | 89% | 100% | 100% |
| `database/adapters/postgresql.ts` | 100% | 96% | 100% | 100% |
| `tools/tool-definitions.ts` | 100% | 100% | 100% | 100% |

### Types (Pure Interfaces/Enums) - Phase 5
Type files (`types/*.ts`) contain mostly interfaces, enums, and validation functions. Coverage will come naturally as other tests import them. Only test files with runtime logic (validators, factory functions).

---

## Phase 1: Critical Files (0-15% -> 80%)

### 1.1 `utils/config.ts` - Config parsing utilities
- **What to test**: INI parsing, config validation, default values, edge cases (missing fields, malformed input)
- **Approach**: Pure functions, easy to unit test in isolation
- **New file**: `tests/unit/utils/config.test.ts`

### 1.2 `tools/handlers/config-handlers.ts` - add/update/remove/get database config
- **What to test**: Each handler function with mocked ConnectionManager, SchemaManager, etc.
- **Approach**: Mock the ToolHandlerContext, test each handler returns correct MCP responses
- **New file**: `tests/unit/tools/config-handlers.test.ts`

### 1.3 `tools/handlers/schema-handlers.ts` - schema/list/test/refresh tools
- **What to test**: Each handler with mocked context, success and error paths
- **Approach**: Same as config-handlers - mock context, verify responses
- **New file**: `tests/unit/tools/schema-handlers.test.ts`

### 1.4 `utils/error-handler.ts` - Error formatting and classification
- **What to test**: Error type detection, message formatting, stack trace handling, all error categories
- **Approach**: Pure functions, pass various error types and verify output
- **New file**: `tests/unit/utils/error-handler.test.ts`

### 1.5 `classes/EnhancedSSHTunnelManager.ts` - SSH tunnel lifecycle
- **What to test**: Tunnel creation, port assignment, health checks, cleanup, timeout handling, reconnection
- **Approach**: Mock `ssh2.Client` and `net.Server`, test state machine transitions
- **Expand**: `tests/unit/enhanced-ssh-tunnel.test.ts` (exists but only covers 14%)

---

## Phase 2: Low Coverage Files (15-50% -> 80%)

### 2.1 `tools/dispatcher.ts` - Tool call routing
- **What to test**: Routing for all tool names, unknown tool handling, error propagation
- **Approach**: Mock handler functions, verify correct handler called for each tool name
- **New file**: `tests/unit/tools/dispatcher.test.ts`

### 2.2 `tools/handlers/query-handlers.ts` - query/batch/performance tools
- **What to test**: Query execution, batch queries, performance analysis, SELECT-only enforcement
- **Approach**: Mock context with controlled query results
- **New file**: `tests/unit/tools/query-handlers.test.ts`

### 2.3 `utils/response-formatter.ts` - Table formatting
- **What to test**: Table formatting, summary generation, truncation, empty results
- **Approach**: Pure functions with known input/output pairs
- **New file**: `tests/unit/utils/response-formatter.test.ts`

### 2.4 `utils/logger.ts` - Logging system
- **What to test**: Log levels, file rotation, EPIPE handling, stream creation/cleanup, formatting
- **Approach**: Mock fs streams, test each log level and output mode
- **New file**: `tests/unit/utils/logger.test.ts`

### 2.5 `classes/ConnectionManager.ts` - Connection lifecycle
- **What to test**: Connection pooling, retry logic, adapter creation, SSH tunnel integration, cleanup
- **Approach**: Expand existing test with retry scenarios, multi-DB connections, error recovery
- **Expand**: `tests/unit/connection-manager.test.ts`

---

## Phase 3: Medium Coverage Files (50-80% -> 80%)

### 3.1 `database/adapters/index.ts` - Adapter factory
- **What to test**: Factory creation for each DB type, unknown type handling
- **Expand**: Add factory tests to existing adapter test files

### 3.2 `classes/SecurityManager.ts` - Query security validation
- **What to test**: Complexity scoring, all SQL injection patterns, edge cases
- **Expand**: `tests/unit/security-manager.test.ts`

### 3.3 `classes/SQLMCPServer.ts` - Server lifecycle
- **What to test**: Config loading, MCP handler registration, error responses, cleanup
- **Expand**: `tests/integration/mcp-server.test.ts`

### 3.4 `database/adapters/sqlite.ts` - SQLite adapter
- **What to test**: Schema capture, WAL mode, file path handling
- **Expand**: `tests/unit/adapters/sqlite-adapter.test.ts`

### 3.5 `classes/RedactionManager.ts` - Field redaction
- **What to test**: Regex edge cases, nested field patterns, audit logging
- **Expand**: `tests/unit/redaction-manager.test.ts`

### 3.6 `database/adapters/base.ts` - Base adapter
- **What to test**: Remaining protected methods, edge cases in normalization
- **Expand**: `tests/unit/adapters/base-adapter.test.ts`

---

## Phase 4: Polish (80% -> 90%+)

Raise already-good files to 90%+ by covering remaining branch edge cases:
- `SchemaManager.ts`: Cover cache miss paths, concurrent refresh
- `port-manager.ts`: Cover edge cases in port conflict resolution
- Database adapters: Cover remaining branch conditions

---

## Phase 5: Type Files

Only add tests for `types/*.ts` files that contain runtime logic:
- `types/index.ts` - Has factory functions and constants
- `types/mcp.ts` - Has validation helpers
- Others are pure interfaces/enums (zero runtime code, no tests needed)

---

## Execution Strategy

1. **Parallelize by independence**: Phases 1.1-1.4 and 2.1-2.3 can all be done in parallel (different files, no shared state)
2. **Test pattern**: For each file, follow the existing test conventions (Jest, mocked dependencies, descriptive `describe`/`it` blocks)
3. **Incremental thresholds**: Raise `jest.config.json` thresholds after each phase:
   - After Phase 1: statements 40%, branches 25%, functions 40%, lines 40%
   - After Phase 2: statements 60%, branches 45%, functions 60%, lines 60%
   - After Phase 3: statements 75%, branches 65%, functions 75%, lines 75%
   - After Phase 4: statements 80%, branches 70%, functions 80%, lines 80%

---

## Estimated New Test Files

| Phase | New Files | Estimated Tests |
|-------|-----------|----------------|
| 1     | 4 new + 1 expand | ~120 tests |
| 2     | 4 new + 1 expand | ~100 tests |
| 3     | 6 expand | ~80 tests |
| 4     | 4 expand | ~30 tests |
| 5     | 2 new | ~20 tests |
| **Total** | **10 new + 12 expand** | **~350 new tests** |

Final target: **~766 tests** (416 current + ~350 new), **80%+ coverage** across all metrics.
