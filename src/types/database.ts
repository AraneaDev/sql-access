/**
 * Core type definitions for SQL MCP Server
 */

import type { Client as PgClient } from 'pg';
import type { Connection as MySQLConnection } from 'mysql2/promise';
import type { Database as SQLiteConnection } from 'sqlite3';
import type { ConnectionPool as MSSQLConnection } from 'mssql';
import type { Client as SSHClient } from 'ssh2';
import type { Server as NetServer } from 'net';

// ============================================================================
// Database Types
// ============================================================================

export enum DatabaseType {
  MYSQL = 'mysql',
  POSTGRESQL = 'postgresql', 
  POSTGRES = 'postgres',
  SQLITE = 'sqlite',
  MSSQL = 'mssql',
  SQLSERVER = 'sqlserver'
}

// For backward compatibility, also export as type
export type DatabaseTypeString = 'mysql' | 'postgresql' | 'postgres' | 'sqlite' | 'mssql' | 'sqlserver';

export interface DatabaseConfig {
  type: DatabaseTypeString;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  select_only?: boolean;
  timeout?: number;
  file?: string; // For SQLite
  encrypt?: boolean; // For MSSQL
  
  // SSH Tunnel Configuration
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  ssh_private_key?: string;
  ssh_passphrase?: string;
  local_port?: number;
}

export type DatabaseConnection = PgClient | MySQLConnection | SQLiteConnection | MSSQLConnection;

export interface ConnectionInfo {
  connection: DatabaseConnection;
  type: DatabaseTypeString;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  truncated: boolean;
  execution_time_ms: number;
}

export interface ExecutionResult {
  success: boolean;
  data?: QueryResult;
  error?: string;
  database: string;
  query: string;
  ssh_tunnel: boolean;
  select_only_mode: boolean;
  security_violation?: boolean;
}

// ============================================================================
// Schema Types
// ============================================================================

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: unknown;
  max_length?: number | null;
  precision?: number | null;
  scale?: number | null;
  comment?: string;
  key?: string;
  extra?: string;
}

export interface TableInfo {
  name: string;
  type: string;
  comment?: string;
  columns: ColumnInfo[];
}

export interface DatabaseSchema {
  database: string;
  type: DatabaseTypeString;
  captured_at: string;
  tables: Record<string, TableInfo>;
  views: Record<string, TableInfo>;
  summary: {
    table_count: number;
    view_count: number;
    total_columns: number;
  };
}

export interface SchemaInfo {
  table_count: number;
  view_count: number;
  function_count: number;
  sequence_count: number;
  total_columns: number;
  total_indexes: number;
  foreign_key_count: number;
}

// ============================================================================
// SSH Tunnel Types
// ============================================================================

export interface SSHTunnel {
  server: NetServer;
  connection: SSHClient;
  localPort: number;
  localHost: string;
}

// ============================================================================
// Query and Batch Types
// ============================================================================

export interface QueryObject {
  query: string;
  params?: unknown[];
  label?: string;
}

export interface BatchResultItem {
  index: number;
  label: string;
  success: boolean;
  data?: QueryResult;
  error?: string;
  query: string;
  execution_time_ms?: number;
}

export interface BatchResult {
  results: BatchResultItem[];
  successCount: number;
  failureCount: number;
  totalExecutionTime: number;
  transactionUsed: boolean;
}

export interface BatchAnalysis {
  allowed: boolean;
  warnings: string[];
  total_complexity: number;
  query_count: number;
  table_references: {
    tables: string[];
    conflicts: string[];
    access_map: Record<string, string[]>;
  };
  estimated_resource_usage: {
    cpu_intensity: number;
    memory_usage: number;
    io_operations: number;
    overall_impact: number;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface SecurityConfig {
  max_joins: number;
  max_subqueries: number;
  max_unions: number;
  max_group_bys: number;
  max_complexity_score: number;
  max_query_length: number;
}

export interface ExtensionConfig {
  max_rows: number;
  max_batch_size: number;
  query_timeout: number;
  debug?: boolean;
}

export interface ServerConfig {
  database?: Record<string, DatabaseConfig>;
  security?: SecurityConfig;
  extension?: ExtensionConfig;
  [key: string]: unknown;
}

// ============================================================================
// Error Types
// ============================================================================

export class SQLMCPError extends Error {
  public code: string;
  public details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SQLMCPError';
    this.code = code;
    this.details = details;
  }
}

export class SecurityViolationError extends SQLMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_VIOLATION', details);
    this.name = 'SecurityViolationError';
  }
}

export class ConnectionError extends SQLMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class QueryExecutionError extends SQLMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'QUERY_EXECUTION_ERROR', details);
    this.name = 'QueryExecutionError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export interface DatabaseListItem {
  name: string;
  type: DatabaseTypeString;
  host?: string;
  database?: string;
  ssh_enabled: boolean;
  ssl_enabled: boolean;
  select_only_mode: boolean;
  schema_cached: boolean;
  schema_info?: {
    table_count: number;
    view_count: number;
    total_columns: number;
  };
}

export interface TestConnectionResult {
  success: boolean;
  database: string;
  message?: string;
  error?: string;
  ssh_tunnel: boolean;
  select_only_mode: boolean;
  schema_captured: boolean;
  schema_info?: {
    table_count: number;
    view_count: number;
    total_columns: number;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDatabaseType(value: string): value is DatabaseTypeString {
  return ['mysql', 'postgresql', 'postgres', 'sqlite', 'mssql', 'sqlserver'].includes(value);
}

export function isQueryObject(value: unknown): value is QueryObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'query' in value &&
    typeof (value as QueryObject).query === 'string'
  );
}

export function isSecurityViolationError(error: unknown): error is SecurityViolationError {
  return error instanceof SecurityViolationError;
}
