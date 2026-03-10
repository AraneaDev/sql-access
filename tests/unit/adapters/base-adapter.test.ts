/**
 * Base Database Adapter Tests
 * Tests the abstract DatabaseAdapter base class functionality
 */

import { DatabaseAdapter } from '../../../src/database/adapters/base.js';
import type { 
 DatabaseConnection, 
 DatabaseConfig, 
 QueryResult, 
 DatabaseSchema 
} from '../../../src/types/index.js';

// ============================================================================
// Test Implementation of DatabaseAdapter
// ============================================================================

class TestAdapter extends DatabaseAdapter {
 public testConnection: any = null;
 public testSchema: DatabaseSchema;
 public shouldFailConnection = false;
 public shouldFailQuery = false;
 public shouldFailTransaction = false;

 constructor(config: DatabaseConfig) {
 super(config);
 this.testSchema = this.createBaseSchema('test_db');
 }

 async connect(): Promise<DatabaseConnection> {
 if (this.shouldFailConnection) {
 throw new Error('Connection failed');
 }
 this.testConnection = { id: 'test-connection' };
 return this.testConnection;
 }

 async executeQuery(
 connection: DatabaseConnection,
 query: string,
 params?: unknown[]
 ): Promise<QueryResult> {
 if (this.shouldFailQuery) {
 throw new Error('Query failed');
 }
 
 return {
 rows: [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }],
 rowCount: 2,
 fields: ['id', 'name'],
 truncated: false,
 execution_time_ms: 10
 };
 }

 async disconnect(connection: DatabaseConnection): Promise<void> {
 this.testConnection = null;
 }

 async captureSchema(connection: DatabaseConnection): Promise<DatabaseSchema> {
 return this.testSchema;
 }

 isConnected(connection: DatabaseConnection): boolean {
 return connection === this.testConnection && this.testConnection !== null;
 }

 async beginTransaction(connection: DatabaseConnection): Promise<void> {
 if (this.shouldFailTransaction) {
 throw new Error('Begin transaction failed');
 }
 }

 async commitTransaction(connection: DatabaseConnection): Promise<void> {
 if (this.shouldFailTransaction) {
 throw new Error('Commit transaction failed');
 }
 }

 async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
 if (this.shouldFailTransaction) {
 throw new Error('Rollback transaction failed');
 }
 }

 buildExplainQuery(query: string): string {
 return `EXPLAIN ${query}`;
 }

 protected extractFieldNames(result: unknown): string[] {
 return ['id', 'name'];
 }

 protected extractRawRows(result: unknown): unknown[] {
 return [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }];
 }

 // Expose protected methods for testing
 public testValidateConfig(requiredFields: string[]): void {
 return this.validateConfig(requiredFields);
 }

 public testParseConfigValue<T>(
 value: string | number | boolean | T, 
 type: 'string' | 'number' | 'boolean',
 defaultValue: T
 ): T {
 return this.parseConfigValue(value, type, defaultValue);
 }

 public testCreateError(message: string, originalError?: Error): Error {
 return this.createError(message, originalError);
 }

 public testTruncateResults(rows: unknown[], maxRows: number) {
 return this.truncateResults(rows, maxRows);
 }

 public testNormalizeQueryResult(rawResult: unknown, startTime: number, maxRows?: number) {
 return this.normalizeQueryResult(rawResult, startTime, maxRows);
 }

 public testCreateBaseSchema(databaseName: string) {
 return this.createBaseSchema(databaseName);
 }

 public testUpdateSchemaSummary(schema: DatabaseSchema) {
 return this.updateSchemaSummary(schema);
 }

 public testGetSafeString(row: Record<string, unknown>, field: string): string {
 return this.getSafeString(row, field);
 }

 public testGetSafeNumber(row: Record<string, unknown>, field: string): number | null {
 return this.getSafeNumber(row, field);
 }

 public testGetSafeBoolean(row: Record<string, unknown>, field: string): boolean {
 return this.getSafeBoolean(row, field);
 }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DatabaseAdapter Base Class', () => {
 let testConfig: DatabaseConfig;
 let adapter: TestAdapter;

 beforeEach(() => {
 testConfig = {
 type: 'sqlite',
 database: 'test.db',
 host: 'localhost',
 port: 5432,
 username: 'testuser',
 password: 'testpass',
 timeout: 30000,
 ssl: false
 };
 adapter = new TestAdapter(testConfig);
 });

 // ============================================================================
 // Constructor and Configuration Tests
 // ============================================================================

 describe('constructor', () => {
 it('should initialize with valid config', () => {
 expect(adapter.getType()).toBe('sqlite');
 expect(adapter.getConfig()).toEqual(testConfig);
 });

 it('should parse timeout from string', () => {
 const configWithStringTimeout = { ...testConfig, timeout: 45000 };
 const stringAdapter = new TestAdapter(configWithStringTimeout);
 expect((stringAdapter as any).connectionTimeout).toBe(45000);
 });

 it('should use default timeout for invalid string', () => {
 const configWithInvalidTimeout = { ...testConfig, timeout: -1 };
 const invalidAdapter = new TestAdapter(configWithInvalidTimeout);
 expect((invalidAdapter as any).connectionTimeout).toBe(-1);
 });

 it('should use default timeout when undefined', () => {
 const configWithoutTimeout = { ...testConfig };
 delete configWithoutTimeout.timeout;
 const noTimeoutAdapter = new TestAdapter(configWithoutTimeout);
 expect((noTimeoutAdapter as any).connectionTimeout).toBe(30000);
 });
 });

 // ============================================================================
 // Configuration Methods Tests
 // ============================================================================

 describe('getType', () => {
 it('should return the database type', () => {
 expect(adapter.getType()).toBe('sqlite');
 });
 });

 describe('getConfig', () => {
 it('should return a copy of the configuration', () => {
 const config = adapter.getConfig();
 expect(config).toEqual(testConfig);
 expect(config).not.toBe(testConfig); // Should be a copy
 });
 });

 describe('getSafeConfig', () => {
 it('should redact sensitive fields', () => {
 const safeConfig = adapter.getSafeConfig();
 expect(safeConfig.password).toBe('[REDACTED]');
 expect(safeConfig.host).toBe('localhost');
 expect(safeConfig.database).toBe('test.db');
 });

 it('should redact SSH credentials', () => {
 const configWithSSH = {
 ...testConfig,
 ssh_host: 'ssh.example.com',
 ssh_username: 'sshuser',
 ssh_password: 'sshpass',
 ssh_private_key: 'private-key',
 ssh_passphrase: 'passphrase'
 };
 const sshAdapter = new TestAdapter(configWithSSH);
 const safeConfig = sshAdapter.getSafeConfig();
 
 expect(safeConfig.ssh_password).toBe('[REDACTED]');
 expect(safeConfig.ssh_private_key).toBe('[REDACTED]');
 expect(safeConfig.ssh_passphrase).toBe('[REDACTED]');
 expect(safeConfig.ssh_host).toBe('ssh.example.com');
 });

 it('should handle undefined sensitive fields', () => {
 const configWithoutSensitive = {
 type: 'sqlite' as const,
 database: 'test.db'
 };
 const minimalAdapter = new TestAdapter(configWithoutSensitive);
 const safeConfig = minimalAdapter.getSafeConfig();
 
 expect(safeConfig.password).toBeUndefined();
 expect(safeConfig.ssh_password).toBeUndefined();
 });
 });

 // ============================================================================
 // Validation Methods Tests
 // ============================================================================

 describe('validateConfig', () => {
 it('should pass validation with all required fields present', () => {
 expect(() => {
 adapter.testValidateConfig(['host', 'database', 'username']);
 }).not.toThrow();
 });

 it('should throw error for missing required fields', () => {
 const incompleteConfig = { type: 'sqlite' as const };
 const incompleteAdapter = new TestAdapter(incompleteConfig);
 
 expect(() => {
 incompleteAdapter.testValidateConfig(['host', 'database', 'username']);
 }).toThrow('Missing required configuration fields: host, database, username');
 });

 it('should throw error for null values', () => {
 const nullConfig = { ...testConfig, host: null };
 const nullAdapter = new TestAdapter(nullConfig as any);
 
 expect(() => {
 nullAdapter.testValidateConfig(['host']);
 }).toThrow('Missing required configuration fields: host');
 });

 it('should throw error for empty string values', () => {
 const emptyConfig = { ...testConfig, database: '' };
 const emptyAdapter = new TestAdapter(emptyConfig);
 
 expect(() => {
 emptyAdapter.testValidateConfig(['database']);
 }).toThrow('Missing required configuration fields: database');
 });
 });

 // ============================================================================
 // Config Parsing Tests
 // ============================================================================

 describe('parseConfigValue', () => {
 it('should parse string values', () => {
 expect(adapter.testParseConfigValue(123, 'string', 'default')).toBe('123');
 expect(adapter.testParseConfigValue('test', 'string', 'default')).toBe('test');
 expect(adapter.testParseConfigValue(null, 'string', 'default')).toBe('default');
 });

 it('should parse number values', () => {
 expect(adapter.testParseConfigValue('123', 'number', 0)).toBe(123);
 expect(adapter.testParseConfigValue(456, 'number', 0)).toBe(456);
 expect(adapter.testParseConfigValue('invalid', 'number', 999)).toBe(999);
 expect(adapter.testParseConfigValue(null, 'number', 777)).toBe(777);
 });

 it('should parse boolean values', () => {
 expect(adapter.testParseConfigValue('true', 'boolean', false)).toBe(true);
 expect(adapter.testParseConfigValue('TRUE', 'boolean', false)).toBe(true);
 expect(adapter.testParseConfigValue('false', 'boolean', true)).toBe(false);
 expect(adapter.testParseConfigValue(true, 'boolean', false)).toBe(true);
 expect(adapter.testParseConfigValue('invalid', 'boolean', true)).toBe(false);
 expect(adapter.testParseConfigValue(null, 'boolean', true)).toBe(true);
 });

 it('should return value as-is for unknown types', () => {
 const complexValue = { key: 'value' };
 expect(adapter.testParseConfigValue(complexValue, 'string' as any, { key: 'default' })).toBe('[object Object]');
 });
 });

 // ============================================================================
 // Error Handling Tests
 // ============================================================================

 describe('createError', () => {
 it('should create error with adapter prefix', () => {
 const error = adapter.testCreateError('Test message');
 expect(error.message).toBe('sqlite adapter error: Test message');
 });

 it('should wrap original error', () => {
 const originalError = new Error('Original error');
 originalError.stack = 'original stack trace';
 const wrappedError = adapter.testCreateError('Test message', originalError);
 
 expect(wrappedError.message).toBe('sqlite adapter error: Test message - Original error');
 expect(wrappedError.stack).toBe('original stack trace');
 });
 });

 // ============================================================================
 // Result Processing Tests
 // ============================================================================

 describe('truncateResults', () => {
 it('should not truncate when under limit', () => {
 const rows = [1, 2, 3];
 const result = adapter.testTruncateResults(rows, 5);
 
 expect(result.rows).toEqual([1, 2, 3]);
 expect(result.truncated).toBe(false);
 });

 it('should truncate when over limit', () => {
 const rows = [1, 2, 3, 4, 5];
 const result = adapter.testTruncateResults(rows, 3);
 
 expect(result.rows).toEqual([1, 2, 3]);
 expect(result.truncated).toBe(true);
 });

 it('should handle empty arrays', () => {
 const result = adapter.testTruncateResults([], 10);
 
 expect(result.rows).toEqual([]);
 expect(result.truncated).toBe(false);
 });
 });

 describe('normalizeQueryResult', () => {
 it('should normalize query results correctly', () => {
 const startTime = Date.now() - 100;
 const mockResult = { rows: [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }] };
 
 const normalized = adapter.testNormalizeQueryResult(mockResult, startTime);
 
 expect(normalized.rows).toEqual([{ id: 1, name: 'test' }, { id: 2, name: 'test2' }]);
 expect(normalized.rowCount).toBe(2);
 expect(normalized.fields).toEqual(['id', 'name']);
 expect(normalized.truncated).toBe(false);
 expect(normalized.execution_time_ms).toBeGreaterThanOrEqual(100);
 });

 it('should handle truncation in normalization', () => {
 const startTime = Date.now();
 const mockResult = { rows: [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }] };
 
 const normalized = adapter.testNormalizeQueryResult(mockResult, startTime, 5);
 
 expect(normalized.rows).toHaveLength(2);
 expect(normalized.rowCount).toBe(2); // Original count before truncation
 expect(normalized.truncated).toBe(false);
 });
 });

 // ============================================================================
 // Schema Methods Tests
 // ============================================================================

 describe('createBaseSchema', () => {
 it('should create base schema structure', () => {
 const schema = adapter.testCreateBaseSchema('test_database');
 
 expect(schema.database).toBe('test_database');
 expect(schema.type).toBe('sqlite');
 expect(schema.tables).toEqual({});
 expect(schema.views).toEqual({});
 expect(schema.summary).toEqual({
 table_count: 0,
 view_count: 0,
 total_columns: 0
 });
 expect(schema.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
 });
 });

 describe('updateSchemaSummary', () => {
 it('should update schema summary correctly', () => {
 const schema = adapter.testCreateBaseSchema('test');
 schema.tables.table1 = {
 name: 'table1',
 type: 'BASE TABLE',
 comment: '',
 columns: [
 { name: 'col1', type: 'int', nullable: false, default: null, comment: '', key: '', extra: '' },
 { name: 'col2', type: 'varchar', nullable: true, default: null, comment: '', key: '', extra: '' }
 ]
 };
 schema.views.view1 = {
 name: 'view1',
 type: 'VIEW',
 comment: '',
 columns: [
 { name: 'col1', type: 'int', nullable: false, default: null, comment: '', key: '', extra: '' }
 ]
 };
 
 adapter.testUpdateSchemaSummary(schema);
 
 expect(schema.summary.table_count).toBe(1);
 expect(schema.summary.view_count).toBe(1);
 expect(schema.summary.total_columns).toBe(3);
 });
 });

 // ============================================================================
 // Safe Value Extraction Tests
 // ============================================================================

 describe('getSafeString', () => {
 it('should extract string values safely', () => {
 const row = { str: 'test', num: 123, bool: true, null: null, undef: undefined };
 
 expect(adapter.testGetSafeString(row, 'str')).toBe('test');
 expect(adapter.testGetSafeString(row, 'num')).toBe('123');
 expect(adapter.testGetSafeString(row, 'bool')).toBe('true');
 expect(adapter.testGetSafeString(row, 'null')).toBe('');
 expect(adapter.testGetSafeString(row, 'undef')).toBe('');
 expect(adapter.testGetSafeString(row, 'missing')).toBe('');
 });
 });

 describe('getSafeNumber', () => {
 it('should extract number values safely', () => {
 const row = { num: 123, str: '456', invalid: 'abc', null: null, undef: undefined };
 
 expect(adapter.testGetSafeNumber(row, 'num')).toBe(123);
 expect(adapter.testGetSafeNumber(row, 'str')).toBe(456);
 expect(adapter.testGetSafeNumber(row, 'invalid')).toBeNull();
 expect(adapter.testGetSafeNumber(row, 'null')).toBeNull();
 expect(adapter.testGetSafeNumber(row, 'undef')).toBeNull();
 expect(adapter.testGetSafeNumber(row, 'missing')).toBeNull();
 });
 });

 describe('getSafeBoolean', () => {
 it('should extract boolean values safely', () => {
 const row = { 
 bool_true: true, 
 bool_false: false, 
 str_yes: 'yes', 
 str_YES: 'YES',
 str_no: 'no',
 str_other: 'other',
 null: null 
 };
 
 expect(adapter.testGetSafeBoolean(row, 'bool_true')).toBe(true);
 expect(adapter.testGetSafeBoolean(row, 'bool_false')).toBe(false);
 expect(adapter.testGetSafeBoolean(row, 'str_yes')).toBe(true);
 expect(adapter.testGetSafeBoolean(row, 'str_YES')).toBe(true);
 expect(adapter.testGetSafeBoolean(row, 'str_no')).toBe(false);
 expect(adapter.testGetSafeBoolean(row, 'str_other')).toBe(false);
 expect(adapter.testGetSafeBoolean(row, 'null')).toBe(false);
 expect(adapter.testGetSafeBoolean(row, 'missing')).toBe(false);
 });
 });

 // ============================================================================
 // Connection Lifecycle Tests
 // ============================================================================

 describe('connection lifecycle', () => {
 it('should connect successfully', async () => {
 const connection = await adapter.connect();
 expect(connection).toBeDefined();
 expect(adapter.isConnected(connection)).toBe(true);
 });

 it('should handle connection failure', async () => {
 adapter.shouldFailConnection = true;
 await expect(adapter.connect()).rejects.toThrow('Connection failed');
 });

 it('should disconnect successfully', async () => {
 const connection = await adapter.connect();
 await adapter.disconnect(connection);
 expect(adapter.isConnected(connection)).toBe(false);
 });
 });

 // ============================================================================
 // Query Execution Tests
 // ============================================================================

 describe('query execution', () => {
 let connection: DatabaseConnection;

 beforeEach(async () => {
 connection = await adapter.connect();
 });

 it('should execute queries successfully', async () => {
 const result = await adapter.executeQuery(connection, 'SELECT * FROM test');
 
 expect(result.rows).toHaveLength(2);
 expect(result.fields).toEqual(['id', 'name']);
 expect(result.rowCount).toBe(2);
 expect(result.truncated).toBe(false);
 expect(result.execution_time_ms).toBeGreaterThanOrEqual(0);
 });

 it('should handle query failure', async () => {
 adapter.shouldFailQuery = true;
 await expect(adapter.executeQuery(connection, 'INVALID QUERY')).rejects.toThrow('Query failed');
 });

 it('should execute queries with parameters', async () => {
 const result = await adapter.executeQuery(connection, 'SELECT * FROM test WHERE id = ?', [1]);
 expect(result).toBeDefined();
 });
 });

 // ============================================================================
 // Transaction Tests
 // ============================================================================

 describe('transaction management', () => {
 let connection: DatabaseConnection;

 beforeEach(async () => {
 connection = await adapter.connect();
 });

 it('should begin transaction successfully', async () => {
 await expect(adapter.beginTransaction(connection)).resolves.toBeUndefined();
 });

 it('should commit transaction successfully', async () => {
 await adapter.beginTransaction(connection);
 await expect(adapter.commitTransaction(connection)).resolves.toBeUndefined();
 });

 it('should rollback transaction successfully', async () => {
 await adapter.beginTransaction(connection);
 await expect(adapter.rollbackTransaction(connection)).resolves.toBeUndefined();
 });

 it('should handle transaction failures', async () => {
 adapter.shouldFailTransaction = true;
 await expect(adapter.beginTransaction(connection)).rejects.toThrow('Begin transaction failed');
 await expect(adapter.commitTransaction(connection)).rejects.toThrow('Commit transaction failed');
 await expect(adapter.rollbackTransaction(connection)).rejects.toThrow('Rollback transaction failed');
 });
 });

 // ============================================================================
 // Performance Analysis Tests
 // ============================================================================

 describe('buildExplainQuery', () => {
 it('should build explain query correctly', () => {
 const query = 'SELECT * FROM users';
 const explainQuery = adapter.buildExplainQuery(query);
 expect(explainQuery).toBe('EXPLAIN SELECT * FROM users');
 });
 });

 // ============================================================================
 // Schema Capture Tests
 // ============================================================================

 describe('schema capture', () => {
 let connection: DatabaseConnection;

 beforeEach(async () => {
 connection = await adapter.connect();
 });

 it('should capture schema successfully', async () => {
 const schema = await adapter.captureSchema(connection);
 
 expect(schema.database).toBe('test_db');
 expect(schema.type).toBe('sqlite');
 expect(schema.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
 expect(schema.tables).toBeDefined();
 expect(schema.views).toBeDefined();
 expect(schema.summary).toBeDefined();
 });
 });

 // ============================================================================
 // Edge Cases and Error Handling
 // ============================================================================

 describe('edge cases', () => {
 it('should handle malformed configuration gracefully', () => {
 const malformedConfig = {} as DatabaseConfig;
 const malformedAdapter = new TestAdapter(malformedConfig);
 
 expect(() => malformedAdapter.getType()).not.toThrow();
 expect(malformedAdapter.getType()).toBeUndefined();
 });

 it('should handle null connections in isConnected', () => {
 expect(adapter.isConnected(null as any)).toBe(false);
 });

 it('should handle invalid result structures in normalization', () => {
 const invalidResult = null;
 const startTime = Date.now();
 
 expect(() => {
 adapter.testNormalizeQueryResult(invalidResult, startTime);
 }).not.toThrow();
 });
 });
});
