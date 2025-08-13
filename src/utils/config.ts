/**
 * Configuration Loading and Validation Utilities
 * Handles loading and validating database configuration from config.ini
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseIni, stringify as stringifyIni } from 'ini';

import type {
  DatabaseConfig,
  ParsedServerConfig,
  ParsedSecurityConfig,
  ParsedExtensionConfig,
  SecurityConfig,
  ExtensionConfig
} from '../types/index.js';

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public field: string, public database?: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Load configuration from config.ini file
 */
export function loadConfiguration(configPath?: string): ParsedServerConfig {
  const path = configPath || join(process.cwd(), 'config.ini');
  
  if (!existsSync(path)) {
    throw new Error(`Configuration file not found: ${path}. Run setup to create initial configuration.`);
  }

  try {
    const configContent = readFileSync(path, 'utf-8');
    const rawConfig = parseIni(configContent);
    
    return parseConfiguration(rawConfig);
  } catch (error) {
    throw new Error(`Failed to load configuration from ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse raw INI configuration into typed configuration
 */
export function parseConfiguration(rawConfig: Record<string, any>): ParsedServerConfig {
  const databases: Record<string, DatabaseConfig> = {};
  
  // Handle nested database configurations (database.name.property)
  if (rawConfig.database && typeof rawConfig.database === 'object') {
    for (const [name, config] of Object.entries(rawConfig.database)) {
      if (typeof config === 'object') {
        databases[name] = parseDatabaseConfig(name, config as Record<string, any>);
      }
    }
  }
  
  // Handle flat database configurations (database.name format)
  const dbKeys = Object.keys(rawConfig).filter(key => key.startsWith('database.'));
  for (const key of dbKeys) {
    const dbName = key.replace('database.', '');
    if (!databases[dbName] && typeof rawConfig[key] === 'object') {
      databases[dbName] = parseDatabaseConfig(dbName, rawConfig[key] as Record<string, any>);
    }
  }

  // Validate we have at least one database
  if (Object.keys(databases).length === 0) {
    throw new ConfigValidationError('No databases configured', 'databases');
  }

  return {
    databases,
    security: parseSecurityConfig(rawConfig.security),
    extension: parseExtensionConfig(rawConfig.extension)
  };
}

/**
 * Parse individual database configuration
 */
export function parseDatabaseConfig(name: string, config: Record<string, any>): DatabaseConfig {
  // Validate required type field
  if (!config.type) {
    throw new ConfigValidationError(`Database '${name}' missing required 'type' field`, 'type', name);
  }

  const validTypes = ['mysql', 'postgresql', 'postgres', 'sqlite', 'mssql', 'sqlserver'];
  if (!validTypes.includes(config.type.toLowerCase())) {
    throw new ConfigValidationError(
      `Database '${name}' has invalid type '${config.type}'. Valid types: ${validTypes.join(', ')}`,
      'type',
      name
    );
  }

  const dbConfig: DatabaseConfig = {
    type: config.type.toLowerCase(),
    select_only: config.select_only === 'true' || config.select_only === true
  };

  // Handle SQLite specific configuration
  if (dbConfig.type === 'sqlite') {
    if (!config.file) {
      throw new ConfigValidationError(`SQLite database '${name}' missing required 'file' field`, 'file', name);
    }
    dbConfig.file = config.file;
  } else {
    // Handle other database types
    validateNetworkedDatabase(name, config, dbConfig);
  }

  // Parse SSH configuration if present
  if (config.ssh_host) {
    parseSSHConfig(name, config, dbConfig);
  }

  return dbConfig;
}

/**
 * Validate networked database configuration (non-SQLite)
 */
function validateNetworkedDatabase(name: string, config: Record<string, any>, dbConfig: DatabaseConfig): void {
  // Validate required fields
  if (!config.host) {
    throw new ConfigValidationError(`Database '${name}' missing required 'host' field`, 'host', name);
  }
  if (!config.username) {
    throw new ConfigValidationError(`Database '${name}' missing required 'username' field`, 'username', name);
  }

  dbConfig.host = config.host;
  dbConfig.port = parseInt(config.port) || getDefaultPort(dbConfig.type);
  dbConfig.database = config.database;
  dbConfig.username = config.username;
  dbConfig.password = config.password;
  dbConfig.ssl = config.ssl === 'true' || config.ssl === true;
  
  // Validate timeout
  const timeout = parseInt(config.timeout);
  dbConfig.timeout = isNaN(timeout) ? 30000 : Math.max(1000, Math.min(300000, timeout));

  // Validate port range
  if (dbConfig.port && (dbConfig.port < 1 || dbConfig.port > 65535)) {
    throw new ConfigValidationError(
      `Database '${name}' has invalid port '${dbConfig.port}'. Port must be between 1 and 65535`,
      'port',
      name
    );
  }
}

/**
 * Parse SSH configuration
 */
function parseSSHConfig(name: string, config: Record<string, any>, dbConfig: DatabaseConfig): void {
  dbConfig.ssh_host = config.ssh_host;
  
  const sshPort = parseInt(config.ssh_port);
  dbConfig.ssh_port = isNaN(sshPort) ? 22 : sshPort;
  
  if (dbConfig.ssh_port < 1 || dbConfig.ssh_port > 65535) {
    throw new ConfigValidationError(
      `Database '${name}' has invalid SSH port '${dbConfig.ssh_port}'. Port must be between 1 and 65535`,
      'ssh_port',
      name
    );
  }

  dbConfig.ssh_username = config.ssh_username;
  dbConfig.ssh_password = config.ssh_password;
  dbConfig.ssh_private_key = config.ssh_private_key;
  dbConfig.ssh_passphrase = config.ssh_passphrase;

  // Validate SSH authentication method
  if (!dbConfig.ssh_password && !dbConfig.ssh_private_key) {
    throw new ConfigValidationError(
      `Database '${name}' SSH configuration requires either 'ssh_password' or 'ssh_private_key'`,
      'ssh_authentication',
      name
    );
  }
}

/**
 * Parse security configuration
 */
function parseSecurityConfig(securityRaw?: Record<string, any>): ParsedSecurityConfig {
  if (!securityRaw || typeof securityRaw !== 'object') {
    return {
      max_joins: 10,
      max_subqueries: 5,
      max_unions: 3,
      max_group_bys: 5,
      max_complexity_score: 100,
      max_query_length: 10000
    };
  }

  const security: ParsedSecurityConfig = {
    max_joins: parseInt(securityRaw.max_joins?.toString() || '10') || 10,
    max_subqueries: parseInt(securityRaw.max_subqueries?.toString() || '5') || 5,
    max_unions: parseInt(securityRaw.max_unions?.toString() || '3') || 3,
    max_group_bys: parseInt(securityRaw.max_group_bys?.toString() || '5') || 5,
    max_complexity_score: parseInt(securityRaw.max_complexity_score?.toString() || '100') || 100,
    max_query_length: parseInt(securityRaw.max_query_length?.toString() || '10000') || 10000
  };

  // Validate security limits
  if (security.max_joins < 0 || security.max_joins > 100) {
    throw new ConfigValidationError('max_joins must be between 0 and 100', 'max_joins');
  }
  if (security.max_subqueries < 0 || security.max_subqueries > 50) {
    throw new ConfigValidationError('max_subqueries must be between 0 and 50', 'max_subqueries');
  }
  if (security.max_unions < 0 || security.max_unions > 20) {
    throw new ConfigValidationError('max_unions must be between 0 and 20', 'max_unions');
  }
  if (security.max_group_bys < 0 || security.max_group_bys > 50) {
    throw new ConfigValidationError('max_group_bys must be between 0 and 50', 'max_group_bys');
  }
  if (security.max_complexity_score < 1 || security.max_complexity_score > 1000) {
    throw new ConfigValidationError('max_complexity_score must be between 1 and 1000', 'max_complexity_score');
  }
  if (security.max_query_length < 100 || security.max_query_length > 100000) {
    throw new ConfigValidationError('max_query_length must be between 100 and 100000', 'max_query_length');
  }

  return security;
}

/**
 * Parse extension configuration
 */
function parseExtensionConfig(extensionRaw?: Record<string, any>): ParsedExtensionConfig {
  if (!extensionRaw || typeof extensionRaw !== 'object') {
    return {
      max_rows: 1000,
      max_batch_size: 10,
      query_timeout: 30000
    };
  }

  const extension: ParsedExtensionConfig = {
    max_rows: parseInt(extensionRaw.max_rows) || 1000,
    max_batch_size: parseInt(extensionRaw.max_batch_size) || 10,
    query_timeout: parseInt(extensionRaw.query_timeout) || 30000
  };

  // Validate extension limits
  if (extension.max_rows < 1 || extension.max_rows > 50000) {
    throw new ConfigValidationError('max_rows must be between 1 and 50000', 'max_rows');
  }
  if (extension.max_batch_size < 1 || extension.max_batch_size > 100) {
    throw new ConfigValidationError('max_batch_size must be between 1 and 100', 'max_batch_size');
  }

  return extension;
}

/**
 * Get default port for database type
 */
function getDefaultPort(type: string): number {
  switch (type.toLowerCase()) {
    case 'mysql': return 3306;
    case 'postgresql':
    case 'postgres': return 5432;
    case 'mssql':
    case 'sqlserver': return 1433;
    case 'sqlite': return 0;
    default: return 0;
  }
}

/**
 * Validate configuration object
 */
export function validateConfiguration(config: ParsedServerConfig): void {
  // Check if databases exist
  if (!config.databases || Object.keys(config.databases).length === 0) {
    throw new ConfigValidationError('No databases configured', 'databases');
  }

  // Validate each database configuration
  for (const [name, dbConfig] of Object.entries(config.databases)) {
    validateDatabaseConfiguration(name, dbConfig);
  }
}

/**
 * Validate individual database configuration
 */
function validateDatabaseConfiguration(name: string, config: DatabaseConfig): void {
  // Type validation is already done during parsing
  
  // Additional runtime validations
  if (config.type !== 'sqlite') {
    if (!config.host) {
      throw new ConfigValidationError(`Database '${name}' missing host`, 'host', name);
    }
    if (!config.username) {
      throw new ConfigValidationError(`Database '${name}' missing username`, 'username', name);
    }
  } else {
    if (!config.file) {
      throw new ConfigValidationError(`SQLite database '${name}' missing file path`, 'file', name);
    }
  }
}

/**
 * Get environment variable with optional default value
 */
export function getEnvironmentVariable(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue;
}

/**
 * Check if configuration file exists
 */
export function configurationExists(configPath?: string): boolean {
  const path = configPath || join(process.cwd(), 'config.ini');
  return existsSync(path);
}

/**
 * Get configuration file path
 */
export function getConfigurationPath(configPath?: string): string {
  return configPath || join(process.cwd(), 'config.ini');
}

/**
 * Load config using the simpler interface expected by setup modules
 */
export const loadConfig = loadConfiguration;

/**
 * Validate config using the interface expected by setup modules  
 */
export const validateConfig = validateConfiguration;

/**
 * Save configuration file
 */
export function saveConfigFile(config: ParsedServerConfig, configPath?: string): void {
  const path = getConfigurationPath(configPath);
  
  // Convert back to INI format manually to avoid dot escaping
  let iniString = '';
  
  // Convert databases
  if (config.databases) {
    for (const [name, dbConfig] of Object.entries(config.databases)) {
      iniString += `[database.${name}]\n`;
      for (const [key, value] of Object.entries(dbConfig)) {
        if (value !== undefined && value !== null) {
          iniString += `${key}=${value}\n`;
        }
      }
      iniString += '\n';
    }
  }
  
  // Convert security config
  if (config.security) {
    iniString += '[security]\n';
    for (const [key, value] of Object.entries(config.security)) {
      if (value !== undefined && value !== null) {
        iniString += `${key}=${value}\n`;
      }
    }
    iniString += '\n';
  }
  
  // Convert extension config
  if (config.extension) {
    iniString += '[extension]\n';
    for (const [key, value] of Object.entries(config.extension)) {
      if (value !== undefined && value !== null) {
        iniString += `${key}=${value}\n`;
      }
    }
    iniString += '\n';
  }
  
  writeFileSync(path, iniString, 'utf-8');
}
