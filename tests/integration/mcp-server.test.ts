import { SQLMCPServer } from '../../src/classes/SQLMCPServer.js';
import { TestConfigFixtures } from '../fixtures/test-configs.js';
import { SampleQueries } from '../fixtures/sample-queries.js';
import type { MCPRequest } from '../../src/types/mcp.js';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('SQLMCPServer Integration Tests', () => {
  let server: SQLMCPServer;
  let tempConfigPath: string;

  beforeEach(async () => {
    // Create temporary config file
    tempConfigPath = path.join(tmpdir(), `test-config-${Date.now()}.ini`);
    const configContent = TestConfigFixtures.generateConfigFileString(
      TestConfigFixtures.completeSetupConfig
    );
    fs.writeFileSync(tempConfigPath, configContent);

    server = new SQLMCPServer();
  });

  afterEach(async () => {
    try {
      await server.cleanup();
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up temp config file
    try {
      fs.unlinkSync(tempConfigPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Server Initialization', () => {
    test('should initialize server with configuration', async () => {
      await expect(server.initialize(tempConfigPath)).resolves.not.toThrow();
    });

    test('should fail initialization with invalid config', async () => {
      const invalidConfigPath = path.join(tmpdir(), 'invalid-config.ini');
      // Write config with invalid database type that will cause parseDatabaseConfig to fail
      fs.writeFileSync(
        invalidConfigPath,
        '[database.test]\ntype = mysql\n# missing required host field'
      );

      await expect(server.initialize(invalidConfigPath)).rejects.toThrow(
        "missing required 'host' field"
      );

      // Cleanup
      fs.unlinkSync(invalidConfigPath);
    });
  });

  describe('MCP Protocol Handling', () => {
    beforeEach(async () => {
      await server.initialize(tempConfigPath);

      // Mock the managers after initialization
      const mockConnectionManager = {
        initialize: jest.fn(),
        registerDatabase: jest.fn(),
        getConnection: jest.fn().mockResolvedValue({ id: 'mock-connection' }),
        testConnection: jest.fn().mockResolvedValue({
          success: true,
          info: { database_version: 'Mock Database 1.0.0' },
        }),
        closeAllConnections: jest.fn().mockResolvedValue(undefined),
        hasDatabase: jest.fn().mockReturnValue(true),
        getDatabaseNames: jest.fn().mockReturnValue(['primary', 'analytics']),
        executeQuery: jest.fn().mockResolvedValue({
          rows: [{ id: 1, name: 'test' }],
          rowCount: 1,
          fields: ['id', 'name'],
          truncated: false,
          execution_time_ms: 10,
        }),
      };
      (server as any).connectionManager = mockConnectionManager;

      // Mock schema manager
      const mockSchemaManager = {
        initialize: jest.fn().mockResolvedValue(undefined),
        hasSchema: jest.fn().mockReturnValue(true),
        captureSchema: jest.fn().mockResolvedValue({}),
        getSchema: jest.fn().mockReturnValue({ summary: { table_count: 5, total_columns: 25 } }),
      };
      (server as any).schemaManager = mockSchemaManager;

      // Mock SSH tunnel manager
      const mockSSHTunnelManager = {
        initialize: jest.fn(),
        hasTunnel: jest.fn().mockReturnValue(false),
        createTunnel: jest.fn().mockResolvedValue({}),
        closeTunnel: jest.fn().mockResolvedValue(undefined),
        closeAllTunnels: jest.fn().mockResolvedValue(undefined),
      };
      (server as any).sshTunnelManager = mockSSHTunnelManager;
    });

    test('should handle list_tools request', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await server.handleRequest(request);

      // Assert response is not null/undefined
      expect(response).toBeDefined();
      if (!response) {
        fail('Expected response but got null/undefined');
      }

      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect((response.result as any).tools).toBeDefined();
      expect(Array.isArray((response.result as any).tools)).toBe(true);
      expect((response.result as any).tools.length).toBeGreaterThan(0);

      // Check for expected tools
      const toolNames = (response.result as any).tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('sql_query');
      expect(toolNames).toContain('sql_list_databases');
      expect(toolNames).toContain('sql_get_schema');
    });

    test('should handle tools/call request for execute_query', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sql_query',
          arguments: {
            database: 'primary',
            query: SampleQueries.basicQueries.simple,
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toBeDefined();
      if (!response) {
        fail('Expected response but got null/undefined');
      }

      expect(response.id).toBe(2);
      expect(response.result).toBeDefined();
      expect((response.result as any).content).toBeDefined();
      expect(Array.isArray((response.result as any).content)).toBe(true);
      expect((response.result as any).content[0].type).toBe('text');
    });

    test('should return error for invalid tool name', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {},
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toBeDefined();
      if (!response) {
        fail('Expected response but got null/undefined');
      }

      expect(response.id).toBe(6);
      expect((response as any).result).toBeDefined();
      expect((response as any).result.isError).toBe(true);
      expect((response as any).result.content[0].text).toContain('Unknown tool');
    });
  });

  describe('Query Execution', () => {
    beforeEach(async () => {
      // Initialize server first
      await server.initialize(tempConfigPath);

      // Then mock the connection manager that was created
      const mockConnectionManager = {
        initialize: jest.fn(),
        registerDatabase: jest.fn(),
        getConnection: jest.fn().mockResolvedValue({ id: 'mock-connection' }),
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        closeAll: jest.fn().mockResolvedValue(undefined),
        closeAllConnections: jest.fn().mockResolvedValue(undefined),
        hasDatabase: jest.fn().mockReturnValue(true),
        getDatabaseNames: jest.fn().mockReturnValue(['primary']),
        getAdapter: jest.fn(),
        executeQuery: jest.fn().mockResolvedValue({
          rows: [
            { id: 1, name: 'John', email: 'john@example.com' },
            { id: 2, name: 'Jane', email: 'jane@example.com' },
          ],
          rowCount: 2,
          fields: ['id', 'name', 'email'],
          truncated: false,
          execution_time_ms: 10,
        }),
      };
      (server as any).connectionManager = mockConnectionManager;

      // Mock schema manager methods directly on the server
      const mockSchemaManager = {
        initialize: jest.fn().mockResolvedValue(undefined),
        hasSchema: jest.fn().mockReturnValue(true),
        captureSchema: jest.fn().mockResolvedValue({}),
        getSchema: jest.fn().mockReturnValue({ summary: { table_count: 5, total_columns: 25 } }),
      };
      (server as any).schemaManager = mockSchemaManager;

      // Mock SSH tunnel manager methods
      const mockSSHTunnelManager = {
        initialize: jest.fn(),
        hasTunnel: jest.fn().mockReturnValue(false),
        createTunnel: jest.fn().mockResolvedValue({}),
        closeTunnel: jest.fn().mockResolvedValue(undefined),
        closeAllTunnels: jest.fn().mockResolvedValue(undefined),
      };
      (server as any).sshTunnelManager = mockSSHTunnelManager;
    });

    test('should execute safe queries successfully', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'sql_query',
          arguments: {
            database: 'primary',
            query: 'SELECT * FROM users',
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toBeDefined();
      if (!response) {
        fail('Expected response but got null/undefined');
      }

      expect(response.result as any).toBeDefined();
      expect((response.result as any).content[0].text).toContain('John');
      expect((response.result as any).content[0].text).toContain('jane@example.com');
    });

    test('should block unsafe queries in SELECT-only mode', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'sql_query',
          arguments: {
            database: 'primary',
            query: SampleQueries.modificationQueries.insert,
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toBeDefined();
      if (!response) {
        fail('Expected response but got null/undefined');
      }

      expect(response.result as any).toBeDefined();
      expect((response.result as any).isError).toBe(true);
      expect((response.result as any).content[0].text).toContain('blocked');
      expect((response.result as any).content[0].text).toContain('INSERT');
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle server initialization failures gracefully', async () => {
      const invalidConfig = path.join(tmpdir(), 'broken-config.ini');
      // Write content that will cause parseConfig to fail due to missing required fields
      fs.writeFileSync(
        invalidConfig,
        '[database.test]\ntype = mysql\n# missing required fields like host, username'
      );

      await expect(server.initialize(invalidConfig)).rejects.toThrow();

      // Cleanup
      fs.unlinkSync(invalidConfig);
    });

    test('should handle connection failures gracefully', async () => {
      await server.initialize(tempConfigPath);

      // Mock the connection manager to simulate failure
      const mockConnectionManager = {
        initialize: jest.fn(),
        registerDatabase: jest.fn(),
        getConnection: jest.fn().mockRejectedValue(new Error('Connection failed')),
        testConnection: jest.fn().mockResolvedValue({ success: false, error: 'Connection failed' }),
        closeAllConnections: jest.fn().mockResolvedValue(undefined),
        hasDatabase: jest.fn().mockReturnValue(true),
        getDatabaseNames: jest.fn().mockReturnValue(['primary']),
        executeQuery: jest
          .fn()
          .mockRejectedValue(new Error("No active connection found for database 'primary'")),
      };
      (server as any).connectionManager = mockConnectionManager;

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'sql_query',
          arguments: {
            database: 'primary',
            query: 'SELECT 1',
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toBeDefined();
      if (!response) {
        fail('Expected response but got null/undefined');
      }

      expect(response.result as any).toBeDefined();
      expect((response.result as any).isError).toBe(true);
      expect((response.result as any).content[0].text).toContain('No active connection found');
    });
  });
});
