import { DatabaseType } from '../types/database.js';
import type { DatabaseConfig, ExtensionConfig, SecurityConfig } from '../types/config.js';
import fs from 'fs';
import path from 'path';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SetupInput {
  databaseName?: string;
  databaseType?: string;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  filePath?: string;
  timeout?: string;
  sshHost?: string;
  sshPort?: string;
  sshUsername?: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  maxRows?: string;
  queryTimeout?: string;
  maxBatchSize?: string;
  maxJoins?: string;
  maxSubqueries?: string;
  maxUnions?: string;
  maxGroupBys?: string;
  maxComplexityScore?: string;
  maxQueryLength?: string;
}

export class SetupValidator {
  /**
   * Validate database name
   */
  static validateDatabaseName(name: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!name || name.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Database name cannot be empty');
      return result;
    }

    const trimmed = name.trim();

    // Check length
    if (trimmed.length > 50) {
      result.isValid = false;
      result.errors.push('Database name cannot be longer than 50 characters');
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      result.isValid = false;
      result.errors.push('Database name can only contain letters, numbers, underscores, and hyphens');
    }

    // Check if starts with letter or underscore
    if (!/^[a-zA-Z_]/.test(trimmed)) {
      result.isValid = false;
      result.errors.push('Database name must start with a letter or underscore');
    }

    // Warn about reserved names
    const reservedNames = ['default', 'config', 'extension', 'security', 'system', 'admin'];
    if (reservedNames.includes(trimmed.toLowerCase())) {
      result.warnings.push(`Database name '${trimmed}' is a reserved word - consider using a different name`);
    }

    return result;
  }

  /**
   * Validate database type
   */
  static validateDatabaseType(type: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!type || type.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Database type cannot be empty');
      return result;
    }

    const normalizedType = type.toLowerCase().trim();
    const validTypes = ['postgresql', 'postgres', 'mysql', 'sqlite', 'sqlite3', 'mssql', 'sqlserver', 'sql server'];

    if (!validTypes.includes(normalizedType)) {
      result.isValid = false;
      result.errors.push(`Invalid database type '${type}'. Valid types: postgresql, mysql, sqlite, mssql`);
    }

    return result;
  }

  /**
   * Validate host
   */
  static validateHost(host: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!host || host.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Host cannot be empty');
      return result;
    }

    const trimmed = host.trim();

    // Check for basic format (allow IP addresses, hostnames, and localhost)
    const hostPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$|^localhost$|^(\d{1,3}\.){3}\d{1,3}$/;
    
    if (!hostPattern.test(trimmed)) {
      result.isValid = false;
      result.errors.push('Host must be a valid hostname or IP address');
    }

    // Warn about localhost in production
    if (trimmed === 'localhost' || trimmed === '127.0.0.1') {
      result.warnings.push('Using localhost - ensure this is correct for your deployment environment');
    }

    return result;
  }

  /**
   * Validate port
   */
  static validatePort(port: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!port || port.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Port cannot be empty');
      return result;
    }

    const portNum = parseInt(port.trim());

    if (isNaN(portNum)) {
      result.isValid = false;
      result.errors.push('Port must be a valid number');
      return result;
    }

    if (portNum < 1 || portNum > 65535) {
      result.isValid = false;
      result.errors.push('Port must be between 1 and 65535');
    }

    // Warn about common ports
    if (portNum < 1024) {
      result.warnings.push('Using a system port (< 1024) - ensure you have proper permissions');
    }

    return result;
  }

  /**
   * Validate file path for SQLite
   */
  static validateFilePath(filePath: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!filePath || filePath.trim().length === 0) {
      result.isValid = false;
      result.errors.push('File path cannot be empty');
      return result;
    }

    const trimmed = filePath.trim();

    // Check if path is absolute or relative
    const isAbsolute = path.isAbsolute(trimmed);
    if (!isAbsolute) {
      result.warnings.push('Using relative path - ensure it\'s correct relative to where you run the server');
    }

    // Check file extension
    const ext = path.extname(trimmed).toLowerCase();
    if (ext !== '.db' && ext !== '.sqlite' && ext !== '.sqlite3' && ext !== '') {
      result.warnings.push('SQLite files typically use .db, .sqlite, or .sqlite3 extensions');
    }

    // Check if directory exists (for the parent directory)
    try {
      const dir = path.dirname(trimmed);
      if (dir !== '.' && !fs.existsSync(dir)) {
        result.warnings.push(`Directory '${dir}' does not exist - ensure it will be created before running`);
      }
    } catch (error) {
      result.warnings.push('Could not validate directory path');
    }

    return result;
  }

  /**
   * Validate timeout value
   */
  static validateTimeout(timeout: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!timeout || timeout.trim().length === 0) {
      return result; // Optional field
    }

    const timeoutNum = parseInt(timeout.trim());

    if (isNaN(timeoutNum)) {
      result.isValid = false;
      result.errors.push('Timeout must be a valid number');
      return result;
    }

    if (timeoutNum < 1000) {
      result.warnings.push('Timeout is very short (< 1 second) - this may cause connection issues');
    }

    if (timeoutNum > 300000) {
      result.warnings.push('Timeout is very long (> 5 minutes) - this may cause long waits for failed connections');
    }

    return result;
  }

  /**
   * Validate SSH configuration
   */
  static validateSSHConfig(sshHost?: string, sshPort?: string, sshUsername?: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!sshHost) {
      return result; // SSH is optional
    }

    // Validate SSH host
    const hostValidation = this.validateHost(sshHost);
    if (!hostValidation.isValid) {
      result.isValid = false;
      result.errors.push(...hostValidation.errors.map(e => `SSH: ${e}`));
    }
    result.warnings.push(...hostValidation.warnings.map(w => `SSH: ${w}`));

    // Validate SSH port
    if (sshPort) {
      const portValidation = this.validatePort(sshPort);
      if (!portValidation.isValid) {
        result.isValid = false;
        result.errors.push(...portValidation.errors.map(e => `SSH: ${e}`));
      }
      result.warnings.push(...portValidation.warnings.map(w => `SSH: ${w}`));
    }

    // Validate SSH username
    if (!sshUsername || sshUsername.trim().length === 0) {
      result.isValid = false;
      result.errors.push('SSH username is required when using SSH tunnel');
    }

    return result;
  }

  /**
   * Validate private key path
   */
  static validatePrivateKeyPath(keyPath: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!keyPath || keyPath.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Private key path cannot be empty');
      return result;
    }

    const trimmed = keyPath.trim();

    try {
      if (!fs.existsSync(trimmed)) {
        result.isValid = false;
        result.errors.push(`Private key file '${trimmed}' does not exist`);
        return result;
      }

      const stats = fs.statSync(trimmed);
      if (!stats.isFile()) {
        result.isValid = false;
        result.errors.push(`Private key path '${trimmed}' is not a file`);
        return result;
      }

      // Check file permissions (Unix-like systems)
      if (process.platform !== 'win32') {
        const mode = stats.mode & parseInt('777', 8);
        if (mode & parseInt('077', 8)) {
          result.warnings.push('Private key file should have restrictive permissions (600 or 400) for security');
        }
      }
    } catch (error) {
      result.warnings.push('Could not validate private key file permissions');
    }

    return result;
  }

  /**
   * Validate complete database configuration
   */
  static validateDatabaseConfig(config: Partial<DatabaseConfig>): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.type) {
      result.isValid = false;
      result.errors.push('Database type is required');
      return result;
    }

    if (config.type === DatabaseType.SQLITE) {
      if (!config.file) {
        result.isValid = false;
        result.errors.push('File path is required for SQLite databases');
      } else {
        const fileValidation = this.validateFilePath(config.file);
        if (!fileValidation.isValid) {
          result.isValid = false;
          result.errors.push(...fileValidation.errors);
        }
        result.warnings.push(...fileValidation.warnings);
      }
    } else {
      // Validate connection parameters for non-SQLite databases
      if (!config.host) {
        result.isValid = false;
        result.errors.push('Host is required');
      } else {
        const hostValidation = this.validateHost(config.host);
        if (!hostValidation.isValid) {
          result.isValid = false;
          result.errors.push(...hostValidation.errors);
        }
        result.warnings.push(...hostValidation.warnings);
      }

      if (config.port) {
        const portValidation = this.validatePort(config.port.toString());
        if (!portValidation.isValid) {
          result.isValid = false;
          result.errors.push(...portValidation.errors);
        }
        result.warnings.push(...portValidation.warnings);
      }

      if (!config.database) {
        result.isValid = false;
        result.errors.push('Database name is required');
      }

      if (!config.username) {
        result.isValid = false;
        result.errors.push('Username is required');
      }

      // Validate SSH config if present
      if (config.ssh_host) {
        const sshValidation = this.validateSSHConfig(config.ssh_host, config.ssh_port?.toString(), config.ssh_username);
        if (!sshValidation.isValid) {
          result.isValid = false;
          result.errors.push(...sshValidation.errors);
        }
        result.warnings.push(...sshValidation.warnings);

        if (config.ssh_private_key) {
          const keyValidation = this.validatePrivateKeyPath(config.ssh_private_key);
          if (!keyValidation.isValid) {
            result.isValid = false;
            result.errors.push(...keyValidation.errors);
          }
          result.warnings.push(...keyValidation.warnings);
        }
      }
    }

    // Validate timeout
    if (config.timeout) {
      const timeoutValidation = this.validateTimeout(config.timeout.toString());
      if (!timeoutValidation.isValid) {
        result.isValid = false;
        result.errors.push(...timeoutValidation.errors);
      }
      result.warnings.push(...timeoutValidation.warnings);
    }

    return result;
  }

  /**
   * Validate numeric input within range
   */
  static validateNumericInput(value: string, fieldName: string, min: number, max: number, defaultValue?: number): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!value || value.trim().length === 0) {
      if (defaultValue !== undefined) {
        result.warnings.push(`${fieldName} is empty, will use default value: ${defaultValue}`);
        return result;
      } else {
        result.isValid = false;
        result.errors.push(`${fieldName} cannot be empty`);
        return result;
      }
    }

    const num = parseInt(value.trim());

    if (isNaN(num)) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be a valid number`);
      return result;
    }

    if (num < min || num > max) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be between ${min} and ${max}`);
    }

    return result;
  }

  /**
   * Validate extension configuration
   */
  static validateExtensionConfig(config: Partial<ExtensionConfig>): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (config.max_rows !== undefined) {
      const validation = this.validateNumericInput(config.max_rows.toString(), 'Max rows', 1, 100000, 1000);
      if (!validation.isValid) {
        result.isValid = false;
        result.errors.push(...validation.errors);
      }
      result.warnings.push(...validation.warnings);
    }

    if (config.query_timeout !== undefined) {
      const validation = this.validateNumericInput(config.query_timeout.toString(), 'Query timeout', 1000, 600000, 30000);
      if (!validation.isValid) {
        result.isValid = false;
        result.errors.push(...validation.errors);
      }
      result.warnings.push(...validation.warnings);
    }

    if (config.max_batch_size !== undefined) {
      const validation = this.validateNumericInput(config.max_batch_size.toString(), 'Max batch size', 1, 100, 10);
      if (!validation.isValid) {
        result.isValid = false;
        result.errors.push(...validation.errors);
      }
      result.warnings.push(...validation.warnings);
    }

    return result;
  }

  /**
   * Validate security configuration
   */
  static validateSecurityConfig(config: Partial<SecurityConfig>): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    const validations = [
      { field: config.max_joins, name: 'Max joins', min: 0, max: 50, def: 10 },
      { field: config.max_subqueries, name: 'Max subqueries', min: 0, max: 20, def: 5 },
      { field: config.max_unions, name: 'Max unions', min: 0, max: 20, def: 3 },
      { field: config.max_group_bys, name: 'Max group bys', min: 0, max: 20, def: 5 },
      { field: config.max_complexity_score, name: 'Max complexity score', min: 1, max: 1000, def: 100 },
      { field: config.max_query_length, name: 'Max query length', min: 100, max: 100000, def: 10000 }
    ];

    for (const validation of validations) {
      if (validation.field !== undefined) {
        const fieldValidation = this.validateNumericInput(
          validation.field.toString(),
          validation.name,
          validation.min,
          validation.max,
          validation.def
        );
        if (!fieldValidation.isValid) {
          result.isValid = false;
          result.errors.push(...fieldValidation.errors);
        }
        result.warnings.push(...fieldValidation.warnings);
      }
    }

    return result;
  }
}
