/**
 * Config Handlers Tests
 * Tests for sql_add_database, sql_update_database, sql_remove_database,
 * sql_get_config, sql_set_mcp_configurable handlers
 */

import {
  handleAddDatabase,
  handleUpdateDatabase,
  handleRemoveDatabase,
  handleGetConfig,
  handleSetMcpConfigurable,
} from '../../../src/tools/handlers/config-handlers.js';
import type { ToolHandlerContext } from '../../../src/tools/handlers/types.js';
import type { ParsedServerConfig, DatabaseConfig } from '../../../src/types/index.js';
import { ConfigurationError, ValidationError } from '../../../src/utils/error-handler.js';

// Mock saveConfigFile
jest.mock('../../../src/utils/config.js', () => ({
  saveConfigFile: jest.fn(),
}));

// Mock response-formatter to pass through
jest.mock('../../../src/utils/response-formatter.js', () => ({
  createToolResponse: jest.fn((text: string, isError = false) => ({
    content: [{ type: 'text', text }],
    _meta: { progressToken: null },
    ...(isError ? { isError: true } : {}),
  })),
}));

function createMockContext(databases: Record<string, DatabaseConfig> = {}): ToolHandlerContext {
  return {
    connectionManager: {
      registerDatabase: jest.fn(),
      unregisterDatabase: jest.fn(),
      getConnection: jest.fn(),
      executeQuery: jest.fn(),
      executeBatch: jest.fn(),
      analyzePerformance: jest.fn(),
    } as any,
    securityManager: {
      validateSelectOnlyQuery: jest.fn(),
    } as any,
    schemaManager: {
      getSchema: jest.fn(),
      hasSchema: jest.fn(),
      captureSchema: jest.fn(),
      refreshSchema: jest.fn(),
      generateSchemaContext: jest.fn(),
    } as any,
    sshTunnelManager: {
      hasTunnel: jest.fn().mockReturnValue(false),
      closeTunnel: jest.fn(),
    } as any,
    config: {
      databases,
    } as ParsedServerConfig,
    configPath: '/tmp/test-config.ini',
    logger: {
      info: jest.fn(),
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    } as any,
  };
}

describe('config-handlers', () => {
  describe('handleAddDatabase', () => {
    it('should add a MySQL database successfully', async () => {
      const ctx = createMockContext();
      const args = {
        name: 'testdb',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'mydb',
        username: 'root',
        password: 'secret',
      };

      const result = await handleAddDatabase(ctx, args);

      expect(result.content[0].text).toContain("Database 'testdb' added successfully");
      expect(result.content[0].text).toContain('mysql');
      expect(ctx.connectionManager.registerDatabase).toHaveBeenCalledWith(
        'testdb',
        expect.objectContaining({ type: 'mysql', host: 'localhost' })
      );
      expect(ctx.config.databases['testdb']).toBeDefined();
    });

    it('should add a SQLite database with file parameter', async () => {
      const ctx = createMockContext();
      const args = {
        name: 'sqlitedb',
        type: 'sqlite',
        file: '/path/to/db.sqlite',
      };

      const result = await handleAddDatabase(ctx, args);

      expect(result.content[0].text).toContain("Database 'sqlitedb' added successfully");
      expect(ctx.config.databases['sqlitedb'].file).toBe('/path/to/db.sqlite');
    });

    it('should throw ConfigurationError if database already exists', async () => {
      const ctx = createMockContext({
        existing: { type: 'mysql', select_only: true } as DatabaseConfig,
      });

      await expect(
        handleAddDatabase(ctx, {
          name: 'existing',
          type: 'mysql',
          host: 'localhost',
          username: 'root',
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ValidationError for invalid database type', async () => {
      const ctx = createMockContext();

      await expect(handleAddDatabase(ctx, { name: 'newdb', type: 'oracle' })).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when SQLite is missing file parameter', async () => {
      const ctx = createMockContext();

      await expect(handleAddDatabase(ctx, { name: 'newdb', type: 'sqlite' })).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when non-SQLite is missing host', async () => {
      const ctx = createMockContext();

      await expect(
        handleAddDatabase(ctx, { name: 'newdb', type: 'mysql', username: 'root' })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when non-SQLite is missing username', async () => {
      const ctx = createMockContext();

      await expect(
        handleAddDatabase(ctx, { name: 'newdb', type: 'mysql', host: 'localhost' })
      ).rejects.toThrow(ValidationError);
    });

    it('should set default port for MySQL when not specified', async () => {
      const ctx = createMockContext();
      const args = {
        name: 'testdb',
        type: 'mysql',
        host: 'localhost',
        username: 'root',
      };

      await handleAddDatabase(ctx, args);

      expect(ctx.config.databases['testdb'].port).toBe(3306);
    });

    it('should add SSH config when ssh_host is provided', async () => {
      const ctx = createMockContext();
      const args = {
        name: 'testdb',
        type: 'mysql',
        host: 'localhost',
        username: 'root',
        ssh_host: 'bastion.example.com',
        ssh_port: 2222,
        ssh_username: 'sshuser',
      };

      await handleAddDatabase(ctx, args);

      const dbConfig = ctx.config.databases['testdb'];
      expect(dbConfig.ssh_host).toBe('bastion.example.com');
      expect(dbConfig.ssh_port).toBe(2222);
      expect(dbConfig.ssh_username).toBe('sshuser');
    });

    it('should default select_only to true', async () => {
      const ctx = createMockContext();
      const args = {
        name: 'testdb',
        type: 'mysql',
        host: 'localhost',
        username: 'root',
      };

      await handleAddDatabase(ctx, args);

      expect(ctx.config.databases['testdb'].select_only).toBe(true);
    });

    it('should accept valid type aliases like postgres and sqlserver', async () => {
      const ctx = createMockContext();

      await handleAddDatabase(ctx, { name: 'pg', type: 'postgres', host: 'h', username: 'u' });
      expect(ctx.config.databases['pg']).toBeDefined();
    });
  });

  describe('handleUpdateDatabase', () => {
    it('should update database fields successfully', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'old-host',
          mcp_configurable: true,
          select_only: true,
        } as DatabaseConfig,
      });

      const result = await handleUpdateDatabase(ctx, {
        database: 'mydb',
        host: 'new-host',
        port: 3307,
      });

      expect(result.content[0].text).toContain("Database 'mydb' updated successfully");
      expect(result.content[0].text).toContain('host');
      expect(result.content[0].text).toContain('port');
      expect(ctx.connectionManager.unregisterDatabase).toHaveBeenCalledWith('mydb');
      expect(ctx.connectionManager.registerDatabase).toHaveBeenCalledWith(
        'mydb',
        expect.anything()
      );
    });

    it('should throw ConfigurationError if database not found', async () => {
      const ctx = createMockContext();

      await expect(
        handleUpdateDatabase(ctx, { database: 'nonexistent', host: 'x' })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError if database is not MCP-configurable', async () => {
      const ctx = createMockContext({
        locked: { type: 'mysql', mcp_configurable: false, select_only: true } as DatabaseConfig,
      });

      await expect(
        handleUpdateDatabase(ctx, { database: 'locked', host: 'new-host' })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should return no-changes message when no fields provided', async () => {
      const ctx = createMockContext({
        mydb: { type: 'mysql', mcp_configurable: true, select_only: true } as DatabaseConfig,
      });

      const result = await handleUpdateDatabase(ctx, { database: 'mydb' });

      expect(result.content[0].text).toContain('No changes provided');
    });

    it('should update all supported fields', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'old',
          mcp_configurable: true,
          select_only: true,
        } as DatabaseConfig,
      });

      await handleUpdateDatabase(ctx, {
        database: 'mydb',
        host: 'h',
        port: 1234,
        database_name: 'db',
        username: 'u',
        password: 'p',
        file: 'f',
        ssl: true,
        ssl_verify: true,
        select_only: false,
        ssh_host: 'sh',
        ssh_port: 22,
        ssh_username: 'su',
        ssh_password: 'sp',
        ssh_private_key: 'sk',
      });

      const dbConfig = ctx.config.databases['mydb'];
      expect(dbConfig.host).toBe('h');
      expect(dbConfig.port).toBe(1234);
      expect(dbConfig.database).toBe('db');
      expect(dbConfig.username).toBe('u');
      expect(dbConfig.password).toBe('p');
      expect(dbConfig.file).toBe('f');
      expect(dbConfig.ssl).toBe(true);
      expect(dbConfig.ssl_verify).toBe(true);
      expect(dbConfig.select_only).toBe(false);
      expect(dbConfig.ssh_host).toBe('sh');
      expect(dbConfig.ssh_port).toBe(22);
      expect(dbConfig.ssh_username).toBe('su');
      expect(dbConfig.ssh_password).toBe('sp');
      expect(dbConfig.ssh_private_key).toBe('sk');
    });
  });

  describe('handleRemoveDatabase', () => {
    it('should remove a database successfully', async () => {
      const ctx = createMockContext({
        mydb: { type: 'mysql', mcp_configurable: true, select_only: true } as DatabaseConfig,
      });

      const result = await handleRemoveDatabase(ctx, 'mydb');

      expect(result.content[0].text).toContain("Database 'mydb' removed successfully");
      expect(ctx.connectionManager.unregisterDatabase).toHaveBeenCalledWith('mydb');
      expect(ctx.config.databases['mydb']).toBeUndefined();
    });

    it('should close SSH tunnel if present', async () => {
      const ctx = createMockContext({
        mydb: { type: 'mysql', mcp_configurable: true, select_only: true } as DatabaseConfig,
      });
      (ctx.sshTunnelManager.hasTunnel as jest.Mock).mockReturnValue(true);

      await handleRemoveDatabase(ctx, 'mydb');

      expect(ctx.sshTunnelManager.closeTunnel).toHaveBeenCalledWith('mydb');
    });

    it('should throw ConfigurationError if database not found', async () => {
      const ctx = createMockContext();

      await expect(handleRemoveDatabase(ctx, 'nonexistent')).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError if not MCP-configurable', async () => {
      const ctx = createMockContext({
        locked: { type: 'mysql', mcp_configurable: false, select_only: true } as DatabaseConfig,
      });

      await expect(handleRemoveDatabase(ctx, 'locked')).rejects.toThrow(ConfigurationError);
    });
  });

  describe('handleGetConfig', () => {
    it('should return redacted config for a database', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'localhost',
          password: 'secret',
          ssh_password: 'sshsecret',
          ssh_private_key: 'privatekey',
          mcp_configurable: true,
          select_only: true,
        } as unknown as DatabaseConfig,
      });

      const result = await handleGetConfig(ctx, 'mydb');
      const text = result.content[0].text;

      expect(text).toContain("Configuration for 'mydb'");
      expect(text).toContain('localhost');
      expect(text).not.toContain('secret');
      expect(text).toContain('***REDACTED***');
      expect(text).toContain('MCP configurable: yes');
    });

    it('should show MCP configurable: no when disabled', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'localhost',
          mcp_configurable: false,
          select_only: true,
        } as DatabaseConfig,
      });

      const result = await handleGetConfig(ctx, 'mydb');

      expect(result.content[0].text).toContain('MCP configurable: no');
    });

    it('should throw ConfigurationError for nonexistent database', async () => {
      const ctx = createMockContext();

      await expect(handleGetConfig(ctx, 'nonexistent')).rejects.toThrow(ConfigurationError);
    });

    it('should redact ssh_passphrase', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'localhost',
          ssh_passphrase: 'mypass',
          mcp_configurable: true,
          select_only: true,
        } as unknown as DatabaseConfig,
      });

      const result = await handleGetConfig(ctx, 'mydb');

      expect(result.content[0].text).toContain('***REDACTED***');
      expect(result.content[0].text).not.toContain('mypass');
    });

    it('should format redaction object as JSON', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'localhost',
          mcp_configurable: true,
          select_only: true,
          redaction: { patterns: ['email'] },
        } as unknown as DatabaseConfig,
      });

      const result = await handleGetConfig(ctx, 'mydb');

      expect(result.content[0].text).toContain('redaction');
    });

    it('should omit undefined values from output', async () => {
      const ctx = createMockContext({
        mydb: {
          type: 'mysql',
          host: 'localhost',
          port: undefined,
          mcp_configurable: true,
          select_only: true,
        } as unknown as DatabaseConfig,
      });

      const result = await handleGetConfig(ctx, 'mydb');
      // The output should not contain "port: undefined"
      expect(result.content[0].text).not.toContain('port');
    });
  });

  describe('handleSetMcpConfigurable', () => {
    it('should disable MCP configurability', async () => {
      const ctx = createMockContext({
        mydb: { type: 'mysql', mcp_configurable: true, select_only: true } as DatabaseConfig,
      });

      const result = await handleSetMcpConfigurable(ctx, 'mydb', false);

      expect(result.content[0].text).toContain('locked from MCP configuration');
      expect(ctx.config.databases['mydb'].mcp_configurable).toBe(false);
    });

    it('should refuse to enable MCP configurability via MCP', async () => {
      const ctx = createMockContext({
        mydb: { type: 'mysql', mcp_configurable: false, select_only: true } as DatabaseConfig,
      });

      const result = await handleSetMcpConfigurable(ctx, 'mydb', true);

      expect(result.content[0].text).toContain('Cannot enable MCP configurability via MCP tools');
      expect(result.isError).toBe(true);
    });

    it('should throw ConfigurationError for nonexistent database', async () => {
      const ctx = createMockContext();

      await expect(handleSetMcpConfigurable(ctx, 'nonexistent', false)).rejects.toThrow(
        ConfigurationError
      );
    });
  });
});
