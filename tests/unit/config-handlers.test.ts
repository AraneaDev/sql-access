import { describe, test, expect, vi } from 'vitest';
import {
  handleUpdateDatabase,
  handleAddDatabase,
} from '../../src/tools/handlers/config-handlers.js';
import type { ToolHandlerContext } from '../../src/tools/handlers/types.js';
import type { ParsedServerConfig } from '../../src/types/index.js';

function createMockContext(configOverrides: Partial<ParsedServerConfig>): ToolHandlerContext {
  const config: ParsedServerConfig = {
    databases: {},
    ...configOverrides,
  };

  return {
    config,
    configPath: '/tmp/test-config.ini',
    connectionManager: {} as never,
    securityManager: {} as never,
    schemaManager: {} as never,
    sshTunnelManager: {} as never,
    metricsManager: {} as never,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as never,
  };
}

describe('database name validation', () => {
  test('should reject database names with INI injection characters', async () => {
    const ctx = createMockContext({});
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
    const ctx = createMockContext({});
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
});

describe('validateDatabaseConfig integration', () => {
  test('should reject databases with embedded credentials in host', async () => {
    const ctx = createMockContext({});
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
});

describe('SQLite path validation', () => {
  test('should reject path traversal in SQLite file', async () => {
    const ctx = createMockContext({});
    await expect(
      handleAddDatabase(ctx, {
        name: 'testdb',
        type: 'sqlite',
        file: '../../../etc/passwd',
      })
    ).rejects.toThrow(/path traversal/i);
  });

  test('should reject /dev/ paths', async () => {
    const ctx = createMockContext({});
    await expect(
      handleAddDatabase(ctx, {
        name: 'testdb',
        type: 'sqlite',
        file: '/dev/zero',
      })
    ).rejects.toThrow(/not allowed/i);
  });
});

describe('handleUpdateDatabase', () => {
  test('should reject select_only changes via MCP', async () => {
    const ctx = createMockContext({
      databases: {
        testdb: { type: 'mysql', select_only: true, mcp_configurable: true } as never,
      },
    });

    await expect(
      handleUpdateDatabase(ctx, { database: 'testdb', select_only: false })
    ).rejects.toThrow(/select_only.*cannot be changed via MCP/i);

    // Verify it wasn't changed
    expect(ctx.config.databases.testdb.select_only).toBe(true);
  });
});
