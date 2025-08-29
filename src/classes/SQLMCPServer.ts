/**
 * Main SQL MCP Server Class
 * Handles MCP protocol communication and coordinates all database operations
 */

import { EventEmitter } from 'events';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseIni } from 'ini';

import type {
  MCPMessage,
  MCPRequest,
  MCPResponse,
  MCPInitializeResult,
  MCPTool,
  MCPToolsListResult,
  MCPToolResponse,
  SQLQueryArgs,
  SQLBatchQueryArgs,
  SQLAnalyzePerformanceArgs,
  SQLGetSchemaArgs,
  SQLTestConnectionArgs,
  SQLRefreshSchemaArgs,
  DatabaseConfig,
  ParsedServerConfig,
  QueryResult,
  TestConnectionResult,
  DatabaseListItem,
  DatabaseSchema
} from '../types/index.js';

import {
  isMCPRequest,
  isMCPToolCallRequest,
  isSQLQueryArgs,
  isSQLBatchQueryArgs,
  isSQLGetSchemaArgs,
  isSQLTestConnectionArgs,
  SecurityViolationError,
  MCP_PROTOCOL_VERSION,
  SERVER_VERSION,
  SERVER_NAME
} from '../types/index.js';

import { ConnectionManager } from './ConnectionManager.js';
import { SecurityManager } from './SecurityManager.js';
import { SchemaManager } from './SchemaManager.js';
import { EnhancedSSHTunnelManager } from './EnhancedSSHTunnelManager.js';
import { Logger } from '../utils/logger.js';

/**
 * Main SQL MCP Server class that coordinates all operations
 */
export class SQLMCPServer extends EventEmitter {
  private readonly connectionManager: ConnectionManager;
  private readonly securityManager: SecurityManager;
  private readonly schemaManager: SchemaManager;
  private readonly sshTunnelManager: EnhancedSSHTunnelManager;
  private readonly logger: Logger;
  
  private config: ParsedServerConfig | null = null;
  private initialized = false;
  
  // MCP protocol constants
  private readonly protocolVersion = MCP_PROTOCOL_VERSION;
  private readonly serverName = SERVER_NAME;
  private readonly serverVersion = SERVER_VERSION;

  constructor() {
    super();
    
    // Create logger with proper config object
    // Disable console output for MCP mode to prevent stdout interference
    this.logger = new Logger({ 
      logFile: './sql-mcp-server.log', 
      logLevel: 'INFO',
      component: 'SQLMCPServer',
      enableConsole: false  // Disable console output for MCP protocol
    });
    
    // Initialize managers with proper dependencies
    this.sshTunnelManager = new EnhancedSSHTunnelManager();
    this.securityManager = new SecurityManager();
    this.connectionManager = new ConnectionManager(this.sshTunnelManager);
    this.schemaManager = new SchemaManager(this.connectionManager);
    
    this.setupEventListeners();
  }

  /**
   * Initialize the MCP server
   */
  public async initialize(configPath?: string): Promise<void> {
    this.logger.info('Initializing SQL MCP Server...');
    
    try {
      // Load configuration
      this.loadConfig(configPath);
      
      // Initialize all managers with configuration
      await this.initializeManagers();
      
      // Setup stdio handling for MCP protocol (only if no config path provided)
      if (!configPath) {
        this.setupStdioHandling();
      }
      
      this.initialized = true;
      this.logger.info('SQL MCP Server initialization complete');
      
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize server', error as Error);
      throw error;
    }
  }

  /**
   * Cleanup and shutdown the server
   */
  public async cleanup(): Promise<void> {
    this.logger.info('Starting server cleanup...');
    
    try {
      // Close all connections and tunnels
      await this.connectionManager.closeAllConnections();
      await this.sshTunnelManager.closeAllTunnels();
      
      this.initialized = false;
      this.logger.info('Server cleanup complete');
      
      this.emit('cleanup');
    } catch (error) {
      this.logger.error('Error during cleanup', error as Error);
      throw error;
    }
  }

  /**
   * Setup event listeners for internal components
   */
  private setupEventListeners(): void {
    // Connection events
    this.connectionManager.on('connected', (dbName: string) => {
      this.logger.info(`Database connection established: ${dbName}`);
    });
    
    this.connectionManager.on('disconnected', (dbName: string) => {
      this.logger.info(`Database connection closed: ${dbName}`);
    });
    
    this.connectionManager.on('error', (error: Error, dbName?: string) => {
      this.logger.error(`Database connection error${dbName ? ` (${dbName})` : ''}`, error);
    });

    // SSH tunnel events
    this.sshTunnelManager.on('tunnel-connected', (dbName: string) => {
      this.logger.info(`SSH tunnel established: ${dbName}`);
    });
    
    this.sshTunnelManager.on('tunnel-disconnected', (dbName: string) => {
      this.logger.info(`SSH tunnel closed: ${dbName}`);
    });
    
    this.sshTunnelManager.on('tunnel-error', (error: Error, dbName?: string) => {
      this.logger.error(`SSH tunnel error${dbName ? ` (${dbName})` : ''}`, error);
    });

    // Schema events
    this.schemaManager.on('schema-cached', (dbName: string) => {
      this.logger.info(`Schema cached: ${dbName}`);
    });
    
    this.schemaManager.on('schema-refreshed', (dbName: string) => {
      this.logger.info(`Schema refreshed: ${dbName}`);
    });

    // Security events
    this.securityManager.on('query-blocked', (dbName: string, reason: string) => {
      this.logger.warning(`Query blocked in ${dbName}: ${reason}`);
    });
    
    this.securityManager.on('query-approved', (dbName: string) => {
      this.logger.info(`Query approved for ${dbName}`);
    });
  }

  /**
   * Load configuration from config.ini
   */
  private loadConfig(configPath?: string): void {
    const finalConfigPath = configPath || join(process.cwd(), 'config.ini');
    
    if (!existsSync(finalConfigPath)) {
      throw new Error('No config.ini found. Run setup to configure databases.');
    }

    try {
      const configContent = readFileSync(finalConfigPath, 'utf-8');
      const rawConfig = parseIni(configContent);
      
      // Transform raw config to typed config
      this.config = this.parseConfig(rawConfig);
      
      this.logger.info(`Configuration loaded: ${Object.keys(this.config.databases).length} databases configured`);
      
      if (this.config.security) {
        this.logger.info('Security configuration loaded', { 
          maxJoins: this.config.security.max_joins,
          maxComplexity: this.config.security.max_complexity_score
        });
      }
      
    } catch (error) {
      this.logger.error('Failed to load configuration', { error, configPath: finalConfigPath });
      throw new Error(`Failed to load config.ini: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse raw INI configuration into typed configuration
   */
  private parseConfig(rawConfig: Record<string, any>): ParsedServerConfig {
    const databases: Record<string, DatabaseConfig> = {};
    
    // Handle nested database configurations
    if (rawConfig.database && typeof rawConfig.database === 'object') {
      for (const [name, config] of Object.entries(rawConfig.database)) {
        databases[name] = this.parseDatabaseConfig(name, config as Record<string, any>);
      }
    }
    
    // Handle flat database configurations (database.name format)
    for (const [key, value] of Object.entries(rawConfig)) {
      if (key.startsWith('database.')) {
        const dbName = key.replace('database.', '');
        if (!databases[dbName]) {
          databases[dbName] = this.parseDatabaseConfig(dbName, value as Record<string, any>);
        }
      }
    }
    
    return {
      databases,
      security: rawConfig.security ? {
        max_joins: parseInt(rawConfig.security.max_joins) || 10,
        max_subqueries: parseInt(rawConfig.security.max_subqueries) || 5,
        max_unions: parseInt(rawConfig.security.max_unions) || 3,
        max_group_bys: parseInt(rawConfig.security.max_group_bys) || 5,
        max_complexity_score: parseInt(rawConfig.security.max_complexity_score) || 100,
        max_query_length: parseInt(rawConfig.security.max_query_length) || 10000
      } : undefined,
      extension: rawConfig.extension ? {
        max_rows: parseInt(rawConfig.extension.max_rows) || 1000,
        max_batch_size: parseInt(rawConfig.extension.max_batch_size) || 10,
        query_timeout: parseInt(rawConfig.extension.query_timeout) || 30000
      } : undefined
    };
  }

  /**
   * Parse individual database configuration
   */
  private parseDatabaseConfig(name: string, config: Record<string, any>): DatabaseConfig {
    if (!config.type) {
      throw new Error(`Database ${name} missing required 'type' field`);
    }

    const dbConfig: DatabaseConfig = {
      type: config.type,
      select_only: config.select_only === 'true' || config.select_only === true
    };

    // Required fields for non-SQLite databases
    if (config.type !== 'sqlite') {
      if (!config.host) throw new Error(`Database ${name} missing required 'host' field`);
      if (!config.username) throw new Error(`Database ${name} missing required 'username' field`);
      
      dbConfig.host = config.host;
      dbConfig.port = parseInt(config.port) || this.getDefaultPort(config.type);
      dbConfig.database = config.database;
      dbConfig.username = config.username;
      dbConfig.password = config.password;
      dbConfig.ssl = config.ssl === 'true' || config.ssl === true;
      dbConfig.timeout = parseInt(config.timeout) || 30000;
    } else {
      // SQLite specific
      if (!config.file) throw new Error(`SQLite database ${name} missing required 'file' field`);
      dbConfig.file = config.file;
    }

    // SSH configuration
    if (config.ssh_host) {
      dbConfig.ssh_host = config.ssh_host;
      dbConfig.ssh_port = parseInt(config.ssh_port) || 22;
      dbConfig.ssh_username = config.ssh_username;
      dbConfig.ssh_password = config.ssh_password;
      dbConfig.ssh_private_key = config.ssh_private_key;
      dbConfig.ssh_passphrase = config.ssh_passphrase;
    }

    return dbConfig;
  }

  /**
   * Get default port for database type
   */
  private getDefaultPort(type: string): number {
    switch (type.toLowerCase()) {
      case 'mysql': return 3306;
      case 'postgresql':
      case 'postgres': return 5432;
      case 'mssql':
      case 'sqlserver': return 1433;
      default: return 0;
    }
  }

  /**
   * Initialize all managers with configuration
   */
  private async initializeManagers(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // Initialize security manager with config (handles undefined security/extension config)
    this.securityManager.initialize(this.config);
    
    // Initialize schema manager
    await this.schemaManager.initialize();
    
    // Initialize connection manager with database configurations
    this.connectionManager.initialize(this.config.databases);
    
    // Initialize SSH tunnel manager
    this.sshTunnelManager.initialize();

    this.logger.info('All managers initialized successfully');
  }

  /**
   * Setup stdio handling for MCP protocol communication
   */
  private setupStdioHandling(): void {
    process.stdin.setEncoding('utf8');

    let buffer = '';
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line.trim()).catch(error => {
            this.logger.error('Error handling message', { error, message: line });
          });
        }
      }
    });

    process.stdin.on('end', () => {
      this.logger.info('stdin ended, exiting');
      this.cleanup().then(() => process.exit(0));
    });

    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT, exiting');
      this.cleanup().then(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM, exiting');
      this.cleanup().then(() => process.exit(0));
    });

    this.logger.info('Stdio handling setup complete');
  }

  /**
   * Handle incoming MCP message
   */
  private async handleMessage(messageStr: string): Promise<void> {
    try {
      this.logger.debug(`Received message: ${messageStr}`);
      const message: MCPMessage = JSON.parse(messageStr);

      if (isMCPRequest(message)) {
        const response = await this.handleRequest(message);
        if (response) {
          this.sendMessage(response);
        }
      } else {
        this.logger.warning('Received non-request message', { message });
      }
    } catch (error) {
      this.logger.error('Error parsing message', { error, messageStr });
      
      // Try to extract ID for error response
      let messageId: string | number | null = null;
      try {
        const message = JSON.parse(messageStr);
        messageId = message.id || null;
      } catch (e) {
        // ignore parse error
      }
      
      this.sendErrorResponse(messageId, -32700, 'Parse error');
    }
  }

  /**
   * Handle MCP request (public for testing)
   */
  public async handleRequest(request: MCPRequest): Promise<MCPResponse | null> {
    try {
      switch (request.method) {
        case 'initialize':
          return await this.handleInitialize(request);
        case 'tools/list':
          return await this.handleToolsList(request);
        case 'tools/call':
          return await this.handleToolCall(request);
        case 'notifications/initialized':
          this.initialized = true;
          this.logger.info('Client initialization acknowledged');
          return null; // No response needed for notifications
        default:
          this.logger.warning(`Unknown method: ${request.method}`);
          return this.createErrorResponse(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      this.logger.error(`Error handling request ${request.method}`, { error, requestId: request.id });
      return this.createErrorResponse(
        request.id, 
        -32603, 
        `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(request: MCPRequest): Promise<MCPResponse> {
    this.logger.info('Handling initialize request');
    
    const result: MCPInitializeResult = {
      protocolVersion: this.protocolVersion,
      capabilities: {
        tools: {},
        logging: {}
      },
      serverInfo: {
        name: this.serverName,
        version: this.serverVersion
      }
    };

    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result
    };

    return response;
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(request: MCPRequest): Promise<MCPResponse> {
    this.logger.info('Handling tools/list request');

    const tools: MCPTool[] = [
      {
        name: "sql_query",
        description: "Execute a single SQL query on a configured database with automatic schema awareness and SELECT-only security enforcement",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name from configuration"
            },
            query: {
              type: "string",
              description: "SQL query to execute"
            },
            params: {
              type: "array",
              description: "Optional query parameters for prepared statements",
              items: { type: "string" }
            }
          },
          required: ["database", "query"],
          additionalProperties: false
        }
      },
      {
        name: "sql_batch_query",
        description: "Execute multiple SQL queries in batch on a configured database for improved performance. All queries must pass security validation.",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name from configuration"
            },
            queries: {
              type: "array",
              description: "Array of SQL queries to execute in batch",
              items: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "SQL query to execute"
                  },
                  params: {
                    type: "array",
                    description: "Optional query parameters",
                    items: { type: "string" }
                  },
                  label: {
                    type: "string",
                    description: "Optional label to identify this query in results"
                  }
                },
                required: ["query"],
                additionalProperties: false
              }
            },
            transaction: {
              type: "boolean",
              description: "Execute all queries in a single transaction (only for full-access databases)",
              default: false
            }
          },
          required: ["database", "queries"],
          additionalProperties: false
        }
      },
      {
        name: "sql_analyze_performance",
        description: "Analyze query performance and suggest optimizations using EXPLAIN plans",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name from configuration"
            },
            query: {
              type: "string",
              description: "SQL query to analyze"
            }
          },
          required: ["database", "query"],
          additionalProperties: false
        }
      },
      {
        name: "sql_list_databases",
        description: "List all configured databases with connection status, schema information, and security settings",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "sql_get_schema",
        description: "Get detailed schema information for a database including tables, columns, relationships",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name to get schema for"
            },
            table: {
              type: "string",
              description: "Optional: Get schema for specific table only"
            }
          },
          required: ["database"],
          additionalProperties: false
        }
      },
      {
        name: "sql_test_connection",
        description: "Test connection to a database (creates SSH tunnel if needed and captures schema)",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name to test"
            }
          },
          required: ["database"],
          additionalProperties: false
        }
      },
      {
        name: "sql_refresh_schema",
        description: "Refresh cached schema for a database after structural changes",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name to refresh schema for"
            }
          },
          required: ["database"],
          additionalProperties: false
        }
      }
    ];

    const result: MCPToolsListResult = { tools };

    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result
    };

    return response;
  }

  /**
   * Handle tools/call request
   */
  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    if (!isMCPToolCallRequest(request)) {
      return this.createErrorResponse(request.id, -32602, 'Invalid tool call request');
    }

    const { name, arguments: args } = request.params;
    this.logger.info(`Handling tool call: ${name}`, { args });

    try {
      // Enhanced argument validation
      if (!args || typeof args !== 'object') {
        throw new Error(`Invalid arguments provided for tool '${name}'. Expected object, got ${typeof args}`);
      }

      let result: MCPToolResponse;

      switch (name) {
        case "sql_query":
          if (!isSQLQueryArgs(args)) {
            throw new Error("Missing required arguments: 'database' and 'query' are required");
          }
          result = await this.handleSqlQuery(args);
          break;
          
        case "sql_batch_query":
          if (!isSQLBatchQueryArgs(args)) {
            throw new Error("Missing required arguments: 'database' and 'queries' are required");
          }
          result = await this.handleBatchQuery(args);
          break;
          
        case "sql_analyze_performance":
          if (!args.database || !args.query) {
            throw new Error("Missing required arguments: 'database' and 'query' are required");
          }
          result = await this.handleAnalyzePerformance({
            database: args.database as string,
            query: args.query as string
          });
          break;
          
        case "sql_list_databases":
          result = await this.handleListDatabases();
          break;
          
        case "sql_get_schema":
          if (!isSQLGetSchemaArgs(args)) {
            throw new Error("Missing required argument: 'database' is required");
          }
          result = await this.handleGetSchema(args);
          break;
          
        case "sql_test_connection":
          if (!isSQLTestConnectionArgs(args)) {
            throw new Error("Missing required argument: 'database' is required");
          }
          result = await this.handleTestConnection(args);
          break;
          
        case "sql_refresh_schema":
          if (!args.database) {
            throw new Error("Missing required argument: 'database' is required");
          }
          result = await this.handleRefreshSchema({
            database: args.database as string
          });
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result
      };

      return response;

    } catch (error) {
      this.logger.error(`Error in tool call ${name}`, { error, args });
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const troubleshooting = [
        '**Troubleshooting:**',
        '- Ensure all required arguments are provided',
        '- Check that the database name exists in your configuration',
        '- Verify your database connection is working',
        '- Review the server logs for more details'
      ].join('\n');

      const result: MCPToolResponse = {
        content: [
          {
            type: "text",
            text: `❌ Error in ${name}: ${errorMessage}\n\n${troubleshooting}`
          }
        ],
        isError: true,
        _meta: {
          progressToken: null
        }
      };

      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result
      };

      return response;
    }
  }

  // Tool implementation methods continue in next part...
  
  /**
   * Handle sql_query tool
   */
  private async handleSqlQuery(args: SQLQueryArgs): Promise<MCPToolResponse> {
    const { database, query, params = [] } = args;
    
    try {
      // Get database configuration
      const dbConfig = this.getDatabaseConfig(database);
      if (!dbConfig) {
        throw new Error(`Database configuration '${database}' not found`);
      }

      // Security validation for SELECT-only mode
      if (dbConfig.select_only) {
        const validation = this.securityManager.validateSelectOnlyQuery(query, dbConfig.type);
        if (!validation.allowed) {
          throw new SecurityViolationError(
            `Query blocked: Database '${database}' is configured for SELECT-only access. ${validation.reason}`,
            { database, query: query.substring(0, 100), reason: validation.reason }
          );
        }
      }

      // Create SSH tunnel if needed
      if (dbConfig.ssh_host) {
        // ConnectionManager will handle tunnel creation/reuse
        this.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
      }

      // Execute query
      const result = await this.connectionManager.executeQuery(database, query, params);
      
      // Capture schema if not cached
      if (!this.schemaManager.hasSchema(database)) {
        try {
          const connection = await this.connectionManager.getConnection(database);
          if (connection) {
            const dbConfig = this.getDatabaseConfig(database);
            if (dbConfig) {
              await this.schemaManager.captureSchema(database, dbConfig);
            }
          }
        } catch (error) {
          // Schema capture is optional, log but don't fail
          this.logger.warning('Failed to capture schema', { database, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      // Format response
      let responseText = `✅ Query executed successfully on ${database}\n`;
      if (this.sshTunnelManager.hasTunnel(database)) responseText += `🔒 Connected via SSH tunnel\n`;
      if (dbConfig.select_only) responseText += `🛡️ SELECT-only mode active\n`;
      responseText += `📊 Results: ${result.rowCount} rows`;
      if (result.truncated) responseText += ` (limited to ${result.rows.length})`;
      responseText += '\n\n';

      if (result.rows.length > 0) {
        responseText += this.formatTableResults(result);
      } else {
        responseText += 'No results returned.\n';
      }

      return {
        content: [{ type: "text", text: responseText }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let responseText = `❌ Query failed on ${database}: ${errorMessage}`;
      
      if (error instanceof SecurityViolationError) {
        responseText += '\n\n🛡️ **Security Information:**\n';
        responseText += 'This database is configured with SELECT-only mode for safety.\n';
        responseText += 'Only SELECT, WITH, SHOW, EXPLAIN, and DESCRIBE statements are allowed.\n';
        responseText += 'To modify data, use a database configured with full access permissions.';
      }

      return {
        content: [{ type: "text", text: responseText }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  /**
   * Handle sql_batch_query tool
   */
  private async handleBatchQuery(args: SQLBatchQueryArgs): Promise<MCPToolResponse> {
    const { database, queries, transaction = false } = args;
    
    if (!queries || queries.length === 0) {
      throw new Error('No queries provided for batch execution');
    }

    const maxBatchSize = this.config?.extension?.max_batch_size || 10;
    if (queries.length > maxBatchSize) {
      throw new Error(`Batch size exceeds maximum of ${maxBatchSize} queries`);
    }

    try {
      const dbConfig = this.getDatabaseConfig(database);
      if (!dbConfig) {
        throw new Error(`Database configuration '${database}' not found`);
      }

      // Security validation for SELECT-only mode
      if (dbConfig.select_only) {
        for (const query of queries) {
          const validation = this.securityManager.validateSelectOnlyQuery(query.query, dbConfig.type);
          if (!validation.allowed) {
            throw new SecurityViolationError(
              `Batch contains blocked query: ${validation.reason}`,
              { database, query: query.query.substring(0, 100), reason: validation.reason }
            );
          }
        }
      }

      // Create SSH tunnel if needed
      if (dbConfig.ssh_host) {
        // ConnectionManager will handle tunnel creation/reuse
        this.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
      }

      // Execute batch
      const result = await this.connectionManager.executeBatch(database, queries, transaction && !dbConfig.select_only);
      
      // Format response
      let responseText = `🚀 **Batch Query Results** (${database})\n\n`;
      responseText += `⏱️ **Execution Summary:**\n`;
      responseText += `   • Total Time: ${result.totalExecutionTime}ms\n`;
      responseText += `   • Queries Executed: ${result.results.length}\n`;
      responseText += `   • Successful: ${result.successCount} ✅\n`;
      responseText += `   • Failed: ${result.failureCount} ${result.failureCount > 0 ? '❌' : ''}\n`;
      
      if (transaction && !dbConfig.select_only) {
        responseText += `   • Transaction: ${result.transactionUsed ? 'Committed' : 'Used'} 🔄\n`;
      }
      if (dbConfig.select_only) {
        responseText += `   • Security: SELECT-only mode active 🛡️\n`;
      }
      if (this.sshTunnelManager.hasTunnel(database)) {
        responseText += `   • Connection: SSH tunnel 🔒\n`;
      }

      responseText += `\n📊 **Individual Results:**\n\n`;

      for (const queryResult of result.results) {
        responseText += `**${queryResult.label || `Query ${queryResult.index}`}**:\n`;
        
        if (queryResult.success && queryResult.data) {
          responseText += `✅ Success`;
          if (queryResult.data.execution_time_ms) {
            responseText += ` (${queryResult.data.execution_time_ms}ms)`;
          }
          responseText += `\n`;
          
          if (queryResult.data.rows && queryResult.data.rows.length > 0) {
            responseText += `📋 Results: ${queryResult.data.rowCount} rows`;
            if (queryResult.data.truncated) {
              responseText += ` (showing ${queryResult.data.rows.length})`;
            }
            responseText += '\n';
            responseText += this.formatCondensedTableResults(queryResult.data);
          } else {
            responseText += '📋 No results returned\n';
          }
        } else {
          responseText += `❌ Failed: ${queryResult.error}\n`;
        }
        
        responseText += `🔍 Query: \`${queryResult.query?.substring(0, 100)}${queryResult.query && queryResult.query.length > 100 ? '...' : ''}\`\n\n`;
      }

      return {
        content: [{ type: "text", text: responseText }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let responseText = `❌ **Batch Query Failed** (${database})\n\n`;
      responseText += `🚫 **Error:** ${errorMessage}\n\n`;

      if (error instanceof SecurityViolationError) {
        responseText += '\n🛡️ **Security Information:**\n';
        responseText += 'This database is configured with SELECT-only mode for safety.\n';
        responseText += 'All queries in the batch must comply with security restrictions.';
      }

      return {
        content: [{ type: "text", text: responseText }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  // Continue with remaining tool handlers...
  
  /**
   * Handle sql_analyze_performance tool
   */
  private async handleAnalyzePerformance(args: SQLAnalyzePerformanceArgs): Promise<MCPToolResponse> {
    const { database, query } = args;
    
    try {
      const dbConfig = this.getDatabaseConfig(database);
      if (!dbConfig) {
        throw new Error(`Database configuration '${database}' not found`);
      }

      // Create SSH tunnel if needed
      if (dbConfig.ssh_host) {
        // ConnectionManager will handle tunnel creation/reuse
        this.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
      }

      const analysis = await this.connectionManager.analyzePerformance(database, query);
      
      let responseText = `🔍 **Query Performance Analysis** (${database})\n\n`;
      responseText += `⏱️ **Execution Times:**\n`;
      responseText += `   • Query Execution: ${analysis.executionTime}ms\n`;
      responseText += `   • Explain Analysis: ${analysis.explainTime}ms\n\n`;

      responseText += `📊 **Query Results:**\n`;
      responseText += `   • Rows Returned: ${analysis.rowCount}\n`;
      responseText += `   • Columns: ${analysis.columnCount}\n\n`;

      responseText += `🛠️ **Execution Plan:**\n`;
      responseText += '```\n';
      responseText += analysis.executionPlan;
      responseText += '```\n\n';

      responseText += `💡 **Performance Recommendations:**\n`;
      responseText += analysis.recommendations;

      return {
        content: [{ type: "text", text: responseText }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: "text", text: `❌ Performance analysis failed for ${database}: ${errorMessage}` }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  /**
   * Handle sql_list_databases tool
   */
  private async handleListDatabases(): Promise<MCPToolResponse> {
    try {
      const databases = await this.listDatabases();

      let responseText = '📋 Configured Databases:\n\n';
      for (const db of databases) {
        responseText += this.formatDatabaseSummary(db);
      }

      // Show security configuration summary
      if (this.config?.security) {
        responseText += '\n🔒 **Global Security Limits:**\n';
        responseText += `   • Max JOINs: ${this.config.security.max_joins}\n`;
        responseText += `   • Max Subqueries: ${this.config.security.max_subqueries}\n`;
        responseText += `   • Max UNIONs: ${this.config.security.max_unions}\n`;
        responseText += `   • Max GROUP BYs: ${this.config.security.max_group_bys}\n`;
        responseText += `   • Max Complexity Score: ${this.config.security.max_complexity_score}\n`;
        responseText += `   • Max Query Length: ${this.config.security.max_query_length}\n`;
      }

      return {
        content: [{ type: "text", text: responseText }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: "text", text: `❌ Failed to list databases: ${errorMessage}` }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  /**
   * Format a single database summary for handleListDatabases
   */
  private formatDatabaseSummary(db: DatabaseListItem): string {
    let summary = `🗄️ **${db.name}** (${db.type})\n`;
    if (db.host) summary += `   📍 ${db.host}\n`;
    if (db.ssh_enabled) summary += `   🔒 SSH tunnel enabled\n`;
    if (db.ssl_enabled) summary += `   🛡️ SSL enabled\n`;

    if (db.select_only_mode) {
      summary += `   🛡️ Security: SELECT-only mode (production safe)\n`;
      summary += `      ✅ Allows: SELECT, WITH, SHOW, EXPLAIN, DESCRIBE\n`;
      summary += `      🚫 Blocks: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER\n`;
    } else {
      summary += `   ⚠️ Security: Full access mode (use with caution)\n`;
    }

    if (db.schema_cached && db.schema_info) {
      summary += `   📊 Schema: ${db.schema_info.table_count} tables, ${db.schema_info.total_columns} columns\n`;
    } else {
      summary += `   ⏳ Schema not yet captured\n`;
    }
    summary += '\n';
    return summary;
  }

  /**
   * Handle sql_get_schema tool
   */
  private async handleGetSchema(args: SQLGetSchemaArgs): Promise<MCPToolResponse> {
    const { database, table } = args;
    
    try {
      const schema = this.schemaManager.getSchema(database);
      if (!schema) {
        return {
          content: [{ 
            type: "text", 
            text: `❌ No schema available for database '${database}'. Connect to the database first to capture schema.` 
          }],
          _meta: { progressToken: null }
        };
      }

      const schemaText = this.schemaManager.generateSchemaContext(database, table);

      return {
        content: [{ type: "text", text: schemaText }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: "text", text: `❌ Failed to get schema for ${database}: ${errorMessage}` }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  /**
   * Handle sql_test_connection tool
   */
  private async handleTestConnection(args: SQLTestConnectionArgs): Promise<MCPToolResponse> {
    const { database } = args;
    
    try {
      const result = await this.testConnection(database);

      let responseText = '';
      if (result.success) {
        responseText = `✅ Connection successful to ${database}\n`;
        if (result.ssh_tunnel) responseText += `🔒 SSH tunnel established\n`;
        if (result.select_only_mode) responseText += `🛡️ SELECT-only mode active\n`;
        if (result.schema_captured && result.schema_info) {
          responseText += `📊 Schema captured: ${result.schema_info.table_count} tables, ${result.schema_info.total_columns} columns\n`;
        }
      } else {
        responseText = `❌ Connection failed to ${database}: ${result.error}`;
      }

      return {
        content: [{ type: "text", text: responseText }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: "text", text: `❌ Connection test failed for ${database}: ${errorMessage}` }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  /**
   * Handle sql_refresh_schema tool
   */
  private async handleRefreshSchema(args: SQLRefreshSchemaArgs): Promise<MCPToolResponse> {
    const { database } = args;
    
    try {
      const schema = await this.refreshSchema(database);
      
      return {
        content: [{
          type: "text",
          text: `✅ Schema refreshed for ${database}\n📊 Captured: ${schema.summary.table_count} tables, ${schema.summary.total_columns} columns`
        }],
        _meta: { progressToken: null }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: "text", text: `❌ Failed to refresh schema for ${database}: ${errorMessage}` }],
        isError: true,
        _meta: { progressToken: null }
      };
    }
  }

  // Utility methods

  /**
   * Get database configuration by name
   */
  private getDatabaseConfig(name: string): DatabaseConfig | null {
    return this.config?.databases[name] || null;
  }

  /**
   * List all configured databases
   */
  private async listDatabases(): Promise<DatabaseListItem[]> {
    if (!this.config) {
      return [];
    }

    const databases: DatabaseListItem[] = [];

    for (const [name, config] of Object.entries(this.config.databases)) {
      const hasSchema = this.schemaManager.hasSchema(name);
      const schemaInfo = hasSchema ? this.schemaManager.getSchema(name)?.summary : undefined;

      databases.push({
        name,
        type: config.type,
        host: config.host || config.file || 'N/A',
        database: config.database,
        ssh_enabled: !!config.ssh_host,
        ssl_enabled: !!config.ssl,
        select_only_mode: !!config.select_only,
        schema_cached: hasSchema,
        schema_info: schemaInfo ? {
          table_count: schemaInfo.table_count,
          view_count: schemaInfo.view_count,
          total_columns: schemaInfo.total_columns
        } : undefined
      });
    }

    return databases;
  }

  /**
   * Test database connection
   */
  public async testConnection(database: string): Promise<TestConnectionResult> {
    try {
      const dbConfig = this.getDatabaseConfig(database);
      if (!dbConfig) {
        throw new Error(`Database configuration '${database}' not found`);
      }

      // Create SSH tunnel if needed
      if (dbConfig.ssh_host) {
        // ConnectionManager will handle tunnel creation/reuse
        this.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
      }
      
      // Capture schema if not cached
      if (!this.schemaManager.hasSchema(database)) {
        try {
          const connection = await this.connectionManager.getConnection(database);
          if (connection) {
            await this.schemaManager.captureSchema(database, dbConfig);
          }
        } catch (error) {
          // Schema capture is optional, log but don't fail
          this.logger.warning('Failed to capture schema', { database, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      const schema = this.schemaManager.getSchema(database);

      return {
        success: true,
        database,
        message: 'Connection successful',
        ssh_tunnel: this.sshTunnelManager.hasTunnel(database),
        select_only_mode: !!dbConfig.select_only,
        schema_captured: !!schema,
        schema_info: schema ? {
          table_count: schema.summary.table_count,
          view_count: schema.summary.view_count,
          total_columns: schema.summary.total_columns
        } : undefined
      };

    } catch (error) {
      return {
        success: false,
        database,
        error: error instanceof Error ? error.message : 'Unknown error',
        ssh_tunnel: false,
        select_only_mode: false,
        schema_captured: false
      };
    }
  }

  /**
   * Refresh schema for a database
   */
  private async refreshSchema(database: string): Promise<DatabaseSchema> {
    const dbConfig = this.getDatabaseConfig(database);
    if (!dbConfig) {
      throw new Error(`Database configuration '${database}' not found`);
    }

      // Ensure connection exists
      let connection = await this.connectionManager.getConnection(database);
      if (!connection) {
      // Create SSH tunnel if needed
      if (dbConfig.ssh_host) {
        // ConnectionManager will handle tunnel creation/reuse
        this.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
      }
      
      // This will create the connection
      await this.connectionManager.executeQuery(database, 'SELECT 1', []);
      connection = await this.connectionManager.getConnection(database);
      
      if (!connection) {
        throw new Error(`Could not establish connection to ${database}`);
      }
    }

    // Refresh schema
    return await this.schemaManager.refreshSchema(database);
  }

  /**
   * Format query results as table
   */
  private formatTableResults(data: QueryResult): string {
    if (data.rows.length === 0) return 'No results returned.\n';

    const fields = data.fields;
    if (fields.length === 0) return 'No columns returned.\n';

    // Create table header
    let table = '| ' + fields.join(' | ') + ' |\n';
    table += '|' + fields.map(() => '---').join('|') + '|\n';

    // Add rows (limit for readability)
    const rowsToShow = Math.min(data.rows.length, 20);
    for (let i = 0; i < rowsToShow; i++) {
      const row = data.rows[i];
      const values = fields.map(field => {
        let val = row[field];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'string' && val.length > 50) return val.substring(0, 47) + '...';
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
       return String(val);
      });
      table += '| ' + values.join(' | ') + ' |\n';
    }

    if (data.rows.length > rowsToShow) {
      table += `\n... and ${data.rows.length - rowsToShow} more rows\n`;
    }

    return table;
  }

  /**
   * Format condensed table results for batch queries
   */
  private formatCondensedTableResults(data: QueryResult, maxRows = 3): string {
    if (data.rows.length === 0) return 'No results.\n';

    const fields = data.fields;
    if (fields.length === 0) return 'No columns.\n';

    // Create condensed table - show only first few rows
    let table = '| ' + fields.slice(0, 4).join(' | ') + (fields.length > 4 ? ' | ...' : '') + ' |\n';
    table += '|' + fields.slice(0, 4).map(() => '---').join('|') + (fields.length > 4 ? '|---|' : '|') + '\n';

    const rowsToShow = Math.min(data.rows.length, maxRows);
    for (let i = 0; i < rowsToShow; i++) {
      const row = data.rows[i];
      const values = fields.slice(0, 4).map(field => {
        let val = row[field];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'string' && val.length > 20) return val.substring(0, 17) + '...';
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        return String(val);
      });
      if (fields.length > 4) values.push('...');
      table += '| ' + values.join(' | ') + ' |\n';
    }

    if (data.rows.length > rowsToShow) {
      table += `... and ${data.rows.length - rowsToShow} more rows\n`;
    }

    return table + '\n';
  }

  /**
   * Send MCP message
   */
  private sendMessage(message: MCPMessage): void {
    try {
      const messageStr = JSON.stringify(message);
      this.logger.debug(`Sending message: ${messageStr}`);
      process.stdout.write(messageStr + '\n');
    } catch (error) {
      this.logger.error('Error sending message', { error, messageId: typeof message === 'object' ? JSON.stringify(message) : String(message) });
    }
  }

  /**
   * Send error response
   */
  private sendErrorResponse(id: string | number | null, code: number, message: string): void {
    this.sendMessage({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    });
  }

  /**
   * Create error response (for testing)
   */
  private createErrorResponse(id: string | number | null, code: number, message: string): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
  }

  /**
   * Run the MCP server
   */
  public async run(): Promise<void> {
    try {
      await this.initialize();
      this.logger.info("SQL MCP Server running on stdio");
    } catch (error) {
      this.logger.error('Server initialization failed', error as Error);
      process.exit(1);
    }
  }
}
