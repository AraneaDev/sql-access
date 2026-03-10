import type { DatabaseTypeString, DatabaseConfig } from '../../src/types/database.js';
import type { SetupConfig, ExtensionConfig, SecurityConfig } from '../../src/types/config.js';

/**
 * Test configuration fixtures for use in unit and integration tests
 */
export class TestConfigFixtures {
 /**
 * Valid PostgreSQL database configuration
 */
 static get validPostgresConfig(): DatabaseConfig {
 return {
 type: 'postgresql',
 host: 'localhost',
 port: 5432,
 database: 'test_db',
 username: 'test_user',
 password: 'test_password',
 ssl: false,
 select_only: true,
 timeout: 30000
 };
 }

 /**
 * Valid MySQL database configuration
 */
 static get validMysqlConfig(): DatabaseConfig {
 return {
 type: 'mysql',
 host: 'mysql.example.com',
 port: 3306,
 database: 'analytics',
 username: 'analytics_user',
 password: 'secure_password',
 ssl: true,
 select_only: false,
 timeout: 45000
 };
 }

 /**
 * Valid SQLite database configuration
 */
 static get validSqliteConfig(): DatabaseConfig {
 return {
 type: 'sqlite',
 file: './test.db',
 select_only: false,
 timeout: 10000
 };
 }

 /**
 * Valid SQL Server database configuration
 */
 static get validMssqlConfig(): DatabaseConfig {
 return {
 type: 'mssql',
 host: 'sqlserver.company.com',
 port: 1433,
 database: 'production',
 username: 'app_user',
 password: 'app_password',
 ssl: true,
 select_only: true,
 timeout: 30000
 };
 }

 /**
 * Database configuration with SSH tunnel
 */
 static get configWithSSH(): DatabaseConfig {
 return {
 type: 'postgresql',
 host: 'db.internal.com',
 port: 5432,
 database: 'production',
 username: 'prod_user',
 password: 'prod_password',
 ssl: true,
 select_only: true,
 timeout: 30000,
 ssh_host: 'bastion.company.com',
 ssh_port: 22,
 ssh_username: 'deploy_user',
 ssh_private_key: '/home/user/.ssh/id_rsa',
 local_port: 0
 };
 }

 /**
 * Database configuration with SSH password auth
 */
 static get configWithSSHPassword(): DatabaseConfig {
 return {
 type: 'mysql',
 host: 'internal-mysql',
 port: 3306,
 database: 'app_db',
 username: 'app_user',
 password: 'app_password',
 ssl: false,
 select_only: false,
 timeout: 30000,
 ssh_host: 'jump.example.com',
 ssh_port: 2222,
 ssh_username: 'tunnel_user',
 ssh_password: 'tunnel_password',
 local_port: 3307
 };
 }

 /**
 * Valid extension configuration
 */
 static get validExtensionConfig(): ExtensionConfig {
 return {
 max_rows: 1000,
 query_timeout: 30000,
 max_batch_size: 10,
 debug: false
 };
 }

 /**
 * Extension configuration with debug enabled
 */
 static get debugExtensionConfig(): ExtensionConfig {
 return {
 max_rows: 2000,
 query_timeout: 60000,
 max_batch_size: 20,
 debug: true
 };
 }

 /**
 * Valid security configuration
 */
 static get validSecurityConfig(): SecurityConfig {
 return {
 max_joins: 10,
 max_subqueries: 5,
 max_unions: 3,
 max_group_bys: 5,
 max_complexity_score: 100,
 max_query_length: 10000
 };
 }

 /**
 * Strict security configuration
 */
 static get strictSecurityConfig(): SecurityConfig {
 return {
 max_joins: 3,
 max_subqueries: 2,
 max_unions: 1,
 max_group_bys: 2,
 max_complexity_score: 25,
 max_query_length: 2000
 };
 }

 /**
 * Complete valid setup configuration
 */
 static get completeSetupConfig(): SetupConfig {
 return {
 'database.primary': this.validPostgresConfig,
 'database.analytics': this.validMysqlConfig,
 'database.local': this.validSqliteConfig,
 extension: this.validExtensionConfig,
 security: this.validSecurityConfig
 };
 }

 /**
 * Minimal setup configuration
 */
 static get minimalSetupConfig(): SetupConfig {
 return {
 'database.main': this.validSqliteConfig
 };
 }

 /**
 * Production-like setup configuration
 */
 static get productionSetupConfig(): SetupConfig {
 return {
 'database.primary': {
 ...this.validPostgresConfig,
 host: 'prod-db.company.com',
 select_only: true // Production should be read-only
 },
 'database.reporting': this.configWithSSH,
 extension: {
 max_rows: 500,
 query_timeout: 15000,
 max_batch_size: 5,
 debug: false
 },
 security: this.strictSecurityConfig
 };
 }

 /**
 * Invalid database configuration (missing required fields)
 */
 static get invalidDatabaseConfig(): Partial<DatabaseConfig> {
 return {
 type: 'postgresql',
 host: 'localhost',
 // Missing port, database, username, password
 ssl: false,
 select_only: false
 };
 }

 /**
 * Invalid SQLite configuration (missing file)
 */
 static get invalidSqliteConfig(): Partial<DatabaseConfig> {
 return {
 type: 'sqlite',
 // Missing file path
 select_only: false,
 timeout: 10000
 };
 }

 /**
 * Configuration with invalid values
 */
 static get configWithInvalidValues(): SetupConfig {
 return {
 'database.invalid': {
 type: 'postgresql',
 host: '',
 port: -1,
 database: '',
 username: '',
 password: '',
 ssl: false,
 select_only: false,
 timeout: -1000
 },
 extension: {
 max_rows: -100,
 query_timeout: 0,
 max_batch_size: 0,
 debug: false
 },
 security: {
 max_joins: -1,
 max_subqueries: -1,
 max_unions: -1,
 max_group_bys: -1,
 max_complexity_score: 0,
 max_query_length: 0
 }
 };
 }

 /**
 * Sample queries for testing
 */
 static get sampleQueries(): Record<string, string> {
 return {
 simple_select: 'SELECT * FROM users LIMIT 10',
 with_join: 'SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id',
 with_subquery: 'SELECT * FROM users WHERE id IN (SELECT user_id FROM posts)',
 complex_query: `
 WITH user_stats AS (
 SELECT 
 u.id,
 u.name,
 COUNT(p.id) as post_count,
 AVG(p.score) as avg_score
 FROM users u
 LEFT JOIN posts p ON u.id = p.user_id
 GROUP BY u.id, u.name
 )
 SELECT * FROM user_stats WHERE post_count > 5
 `,
 insert_query: 'INSERT INTO users (name, email) VALUES (\'Test User\', \'test@example.com\')',
 update_query: 'UPDATE users SET email = \'newemail@example.com\' WHERE id = 1',
 delete_query: 'DELETE FROM users WHERE id = 1',
 drop_table: 'DROP TABLE test_table',
 create_table: 'CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)'
 };
 }

 /**
 * Expected query analysis results
 */
 static get expectedQueryAnalysis(): Record<string, any> {
 return {
 simple_select: {
 type: 'SELECT',
 tables: ['users'],
 is_safe: true,
 complexity_score: 1
 },
 with_join: {
 type: 'SELECT',
 tables: ['users', 'posts'],
 joins: 1,
 is_safe: true,
 complexity_score: 3
 },
 with_subquery: {
 type: 'SELECT',
 tables: ['users', 'posts'],
 subqueries: 1,
 is_safe: true,
 complexity_score: 4
 },
 insert_query: {
 type: 'INSERT',
 tables: ['users'],
 is_safe: false,
 is_modification: true
 },
 drop_table: {
 type: 'DROP',
 tables: ['test_table'],
 is_safe: false,
 is_modification: true,
 is_dangerous: true
 }
 };
 }

 /**
 * Mock database schemas
 */
 static get mockDatabaseSchemas(): Record<string, any> {
 return {
 users_table: {
 table_name: 'users',
 columns: [
 { column_name: 'id', data_type: 'integer', is_nullable: false },
 { column_name: 'name', data_type: 'varchar', is_nullable: false },
 { column_name: 'email', data_type: 'varchar', is_nullable: true },
 { column_name: 'created_at', data_type: 'timestamp', is_nullable: false }
 ],
 primary_keys: ['id'],
 indexes: [
 { index_name: 'users_pkey', columns: ['id'], is_unique: true },
 { index_name: 'users_email_idx', columns: ['email'], is_unique: true }
 ]
 },
 posts_table: {
 table_name: 'posts',
 columns: [
 { column_name: 'id', data_type: 'integer', is_nullable: false },
 { column_name: 'user_id', data_type: 'integer', is_nullable: false },
 { column_name: 'title', data_type: 'varchar', is_nullable: false },
 { column_name: 'content', data_type: 'text', is_nullable: true },
 { column_name: 'score', data_type: 'integer', is_nullable: true },
 { column_name: 'created_at', data_type: 'timestamp', is_nullable: false }
 ],
 primary_keys: ['id'],
 foreign_keys: [
 { column: 'user_id', references_table: 'users', references_column: 'id' }
 ],
 indexes: [
 { index_name: 'posts_pkey', columns: ['id'], is_unique: true },
 { index_name: 'posts_user_id_idx', columns: ['user_id'], is_unique: false }
 ]
 }
 };
 }

 /**
 * Mock connection test results
 */
 static get mockConnectionResults(): Record<string, any> {
 return {
 successful_connection: {
 success: true,
 message: 'Connection successful',
 database_version: 'PostgreSQL 14.5',
 schema_captured: true,
 schema_info: {
 table_count: 15,
 total_columns: 87,
 total_indexes: 23
 },
 select_only_mode: true,
 connection_time_ms: 245
 },
 failed_connection: {
 success: false,
 error: 'Connection refused',
 message: 'Could not connect to database',
 connection_time_ms: 5000
 },
 timeout_connection: {
 success: false,
 error: 'Connection timeout',
 message: 'Database connection timed out after 30000ms',
 connection_time_ms: 30000
 }
 };
 }

 /**
 * Generate a configuration with specified number of databases
 */
 static generateConfigWithDatabases(count: number): SetupConfig {
 const config: SetupConfig = {
 extension: this.validExtensionConfig,
 security: this.validSecurityConfig
 };

 const dbConfigs = [
 this.validPostgresConfig,
 this.validMysqlConfig,
 this.validSqliteConfig,
 this.validMssqlConfig
 ];

 for (let i = 0; i < count; i++) {
 const dbConfig = dbConfigs[i % dbConfigs.length];
 config[`database.db${i + 1}`] = { ...dbConfig };
 }

 return config;
 }

 /**
 * Generate a configuration file string for testing
 */
 static generateConfigFileString(config: SetupConfig): string {
 let configString = '';

 for (const [key, value] of Object.entries(config)) {
 if (key.startsWith('database.')) {
 configString += `[${key}]\n`;
 const dbConfig = value as DatabaseConfig;
 for (const [prop, val] of Object.entries(dbConfig)) {
 if (val !== undefined && val !== null) {
 configString += `${prop}=${val}\n`;
 }
 }
 configString += '\n';
 }
 }

 if (config.extension) {
 configString += '[extension]\n';
 for (const [prop, val] of Object.entries(config.extension)) {
 if (val !== undefined && val !== null) {
 configString += `${prop}=${val}\n`;
 }
 }
 configString += '\n';
 }

 if (config.security) {
 configString += '[security]\n';
 for (const [prop, val] of Object.entries(config.security)) {
 if (val !== undefined && val !== null) {
 configString += `${prop}=${val}\n`;
 }
 }
 }

 return configString;
 }
}
