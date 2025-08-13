/**
 * Main type exports for SQL MCP Server
 */

// Database types
export type {
  DatabaseType,
  DatabaseTypeString,
  DatabaseConfig,
  DatabaseConnection,
  ConnectionInfo,
  QueryResult,
  ExecutionResult,
  ColumnInfo,
  TableInfo,
  DatabaseSchema,
  SchemaInfo,
  SSHTunnel,
  QueryObject,
  BatchResultItem,
  BatchResult,
  BatchAnalysis,
  ExtensionConfig,
  ServerConfig,
  DatabaseListItem,
  TestConnectionResult
} from './database.js';

// MCP protocol types
export type {
  MCPMessage,
  MCPError,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPCapabilities,
  MCPServerInfo,
  MCPInitializeResult,
  MCPTool,
  MCPToolsListResult,
  MCPToolCallParams,
  MCPToolCallRequest,
  MCPToolContent,
  MCPToolResponse,
  MCPToolParameter,
  MCPToolInputSchema,
  SQLQueryArgs,
  SQLBatchQueryArgs,
  SQLAnalyzePerformanceArgs,
  SQLGetSchemaArgs,
  SQLTestConnectionArgs,
  SQLRefreshSchemaArgs,
  SQLListDatabasesArgs,
  MCPToolValidationError,
  MCPMessageHandler,
  MCPMessageHandlers
} from './mcp.js';

// Security types
export type {
  SecurityValidation,
  BatchValidationResult,
  QueryValidationResult,
  BatchSecurityAnalysis,
  ComplexityRiskLevel,
  QueryComplexityAnalysis,
  ComplexityLimits,
  TokenType,
  SQLToken,
  LogSeverity,
  AuditLogEntry,
  SecurityConfig,
  SecurityManagerConfig,
  DangerousPattern,
  DangerousPatternCategory,
  ISecurityManager
} from './security.js';

// SSH types
export type {
  SSHConnectionConfig,
  SSHForwardConfig,
  SSHTunnelInfo,
  SSHTunnelCreateOptions,
  ISSHTunnelManager,
  SSHConnectionEvent,
  SSHEventPayload,
  SSHAuthMethod,
  SSHAuthInfo,
  SSHTunnelStatus,
  SSHTunnelStatusInfo,
  SSHTunnelValidationResult
} from './ssh.js';

// Configuration types
export type {
  DatabaseSectionConfig,
  RawConfigFile,
  ParsedDatabaseConfig,
  ParsedServerConfig,
  ParsedSecurityConfig,
  ParsedExtensionConfig,
  ConfigValidationError,
  ConfigValidationResult,
  IConfigLoader
} from './config.js';

// Error classes
export {
  SQLMCPError,
  SecurityViolationError,
  ConnectionError,
  QueryExecutionError
} from './database.js';

// Type guards
export {
  isDatabaseType,
  isQueryObject,
  isSecurityViolationError
} from './database.js';

export {
  isMCPRequest,
  isMCPResponse,
  isMCPNotification,
  isMCPToolCallRequest,
  isSQLQueryArgs,
  isSQLBatchQueryArgs,
  isSQLGetSchemaArgs,
  isSQLTestConnectionArgs
} from './mcp.js';

export {
  isComplexityRiskLevel,
  isTokenType,
  isLogSeverity
} from './security.js';

export {
  isSSHConnectionEvent,
  isSSHAuthMethod,
  isSSHTunnelStatus,
  validateSSHConfig
} from './ssh.js';

export {
  isDatabaseSectionConfig,
  isRawConfigFile,
  parseStringToNumber,
  parseStringToBoolean,
  validateDatabaseType,
  getRequiredFields,
  validateRequiredFields
} from './config.js';

// Constants
export {
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_DATABASE_PORTS,
  DEFAULT_CONNECTION_TIMEOUT,
  DEFAULT_SSH_PORT
} from './config.js';

// ============================================================================
// Version Information
// ============================================================================

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const SERVER_VERSION = '2.0.0';
export const SERVER_NAME = 'enhanced-sql-database-server';

// ============================================================================
// Common Enums (as const assertions for better type safety)
// ============================================================================

export const DATABASE_TYPES = ['mysql', 'postgresql', 'postgres', 'sqlite', 'mssql', 'sqlserver'] as const;
export const COMPLEXITY_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const TOKEN_TYPES = ['KEYWORD', 'IDENTIFIER', 'STRING', 'OPERATOR', 'UNKNOWN'] as const;
export const LOG_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
export const SSH_AUTH_METHODS = ['password', 'privateKey', 'agent'] as const;
export const SSH_TUNNEL_STATUSES = ['connecting', 'connected', 'error', 'disconnected', 'reconnecting'] as const;
