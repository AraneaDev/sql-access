/**
 * MySQL Database Adapter
 */

import * as mysql from 'mysql2/promise';
import type { Connection as MySQLConnection } from 'mysql2/promise';
import { DatabaseAdapter } from './base.js';
import type {
  DatabaseConnection,
  QueryResult,
  DatabaseSchema,
  ColumnInfo,
  TableInfo,
} from '../../types/index.js';

// ============================================================================
// MySQL Adapter Implementation
// ============================================================================

export class MySQLAdapter extends DatabaseAdapter {
  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<DatabaseConnection> {
    this.validateConfig(['host', 'database', 'username', 'password']);

    const host = this.config.host as string;
    const database = this.config.database as string;
    const username = this.config.username as string;
    const password = this.config.password as string;

    const connectionConfig: mysql.ConnectionOptions = {
      host,
      port: this.parseConfigValue(this.config.port, 'number', 3306),
      database,
      user: username,
      password,
      connectTimeout: this.connectionTimeout,
    };

    // Handle SSL configuration
    if (this.config.ssl !== undefined) {
      const sslEnabled = this.parseConfigValue(this.config.ssl ?? false, 'boolean', false);
      if (sslEnabled) {
        const sslVerify = this.parseConfigValue(this.config.ssl_verify ?? false, 'boolean', false);
        connectionConfig.ssl = { rejectUnauthorized: sslVerify };
      }
    }

    // Special handling for Azure MariaDB/MySQL
    if (
      this.config.host?.includes('.mariadb.database.azure.com') ||
      this.config.host?.includes('.mysql.database.azure.com')
    ) {
      // Azure requires SSL
      const sslVerify = this.parseConfigValue(this.config.ssl_verify ?? false, 'boolean', false);
      connectionConfig.ssl = { rejectUnauthorized: sslVerify };

      // Format username for Azure if needed
      let azureUser = username;
      if (!azureUser.includes('@') && this.config.host) {
        const serverName = this.config.host.split('.')[0];
        azureUser = `${azureUser}@${serverName}`;
      }
      connectionConfig.user = azureUser;
    }

    try {
      const connection = await mysql.createConnection(connectionConfig);
      return connection as DatabaseConnection;
    } catch (error) {
      throw this.createError('Failed to connect to MySQL database', error as Error);
    }
  }

  async disconnect(connection: DatabaseConnection): Promise<void> {
    try {
      const mysqlConn = connection as MySQLConnection;
      await mysqlConn.end();
    } catch (error) {
      throw this.createError('Failed to disconnect from MySQL database', error as Error);
    }
  }

  isConnected(connection: DatabaseConnection): boolean {
    try {
      if (!connection) {
        return false;
      }
      const mysqlConn = connection as MySQLConnection;
      // MySQL connection doesn't have a direct isConnected method
      // We'll use a simple approach - if the connection exists and hasn't been destroyed
      return mysqlConn && typeof mysqlConn.execute === 'function';
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Query Execution
  // ============================================================================

  async executeQuery(
    connection: DatabaseConnection,
    query: string,
    params: unknown[] = []
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const mysqlConn = connection as MySQLConnection;
      const [rows, fields] = await mysqlConn.execute(
        query,
        (params ?? []) as (string | number | boolean | null)[]
      );

      return this.normalizeQueryResult({ rows, fields }, startTime);
    } catch (error) {
      throw this.createError('Failed to execute MySQL query', error as Error);
    }
  }

  protected extractRawRows(result: unknown): unknown[] {
    const mysqlResult = result as { rows: unknown[]; fields: unknown[] };
    return Array.isArray(mysqlResult.rows) ? mysqlResult.rows : [];
  }

  protected extractFieldNames(result: unknown): string[] {
    const mysqlResult = result as { rows: unknown[]; fields: mysql.FieldPacket[] };
    return mysqlResult.fields?.map((field: mysql.FieldPacket) => field.name) || [];
  }

  // ============================================================================
  // Transaction Management
  // ============================================================================

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    try {
      const mysqlConn = connection as MySQLConnection;
      await mysqlConn.beginTransaction();
    } catch (error) {
      throw this.createError('Failed to begin MySQL transaction', error as Error);
    }
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    try {
      const mysqlConn = connection as MySQLConnection;
      await mysqlConn.commit();
    } catch (error) {
      throw this.createError('Failed to commit MySQL transaction', error as Error);
    }
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    try {
      const mysqlConn = connection as MySQLConnection;
      await mysqlConn.rollback();
    } catch (error) {
      throw this.createError('Failed to rollback MySQL transaction', error as Error);
    }
  }

  // ============================================================================
  // Performance Analysis
  // ============================================================================

  buildExplainQuery(query: string): string {
    // Use JSON format for structured analysis (MySQL 5.7+)
    return `EXPLAIN FORMAT=JSON ${query}`;
  }

  // ============================================================================
  // Schema Capture
  // ============================================================================

  async captureSchema(connection: DatabaseConnection): Promise<DatabaseSchema> {
    try {
      const schema = this.createBaseSchema(this.config.database ?? '');

      // Get all tables and views
      const tablesQuery = `
 SELECT 
 TABLE_NAME,
 TABLE_TYPE,
 TABLE_COMMENT
 FROM information_schema.TABLES 
 WHERE TABLE_SCHEMA = ?
 ORDER BY TABLE_NAME
 `;

      const [tablesRows] = await (connection as MySQLConnection).execute(tablesQuery, [
        this.config.database ?? '',
      ]);
      const tables = tablesRows as Array<{
        TABLE_NAME: string;
        TABLE_TYPE: string;
        TABLE_COMMENT: string;
      }>;

      // Process each table/view
      for (const table of tables) {
        const columns = await this.captureTableColumns(connection, table.TABLE_NAME);

        const tableInfo: TableInfo = {
          name: table.TABLE_NAME,
          type: table.TABLE_TYPE,
          comment: table.TABLE_COMMENT || '',
          columns,
        };

        if (table.TABLE_TYPE === 'BASE TABLE') {
          schema.tables[table.TABLE_NAME] = tableInfo;
        } else {
          schema.views[table.TABLE_NAME] = tableInfo;
        }
      }

      this.updateSchemaSummary(schema);
      return schema;
    } catch (error) {
      throw this.createError('Failed to capture MySQL schema', error as Error);
    }
  }

  private async captureTableColumns(
    connection: DatabaseConnection,
    tableName: string
  ): Promise<ColumnInfo[]> {
    const columnsQuery = `
 SELECT 
 COLUMN_NAME,
 DATA_TYPE,
 IS_NULLABLE,
 COLUMN_DEFAULT,
 CHARACTER_MAXIMUM_LENGTH,
 NUMERIC_PRECISION,
 NUMERIC_SCALE,
 COLUMN_COMMENT,
 COLUMN_KEY,
 EXTRA
 FROM information_schema.COLUMNS 
 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
 ORDER BY ORDINAL_POSITION
 `;

    const [columnsRows] = await (connection as MySQLConnection).execute(columnsQuery, [
      this.config.database ?? '',
      tableName,
    ]);

    const columns = columnsRows as Array<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: unknown;
      CHARACTER_MAXIMUM_LENGTH: number | null;
      NUMERIC_PRECISION: number | null;
      NUMERIC_SCALE: number | null;
      COLUMN_COMMENT: string;
      COLUMN_KEY: string;
      EXTRA: string;
    }>;

    return columns.map(
      (col): ColumnInfo => ({
        name: col.COLUMN_NAME,
        type: col.DATA_TYPE,
        nullable: col.IS_NULLABLE === 'YES',
        default: col.COLUMN_DEFAULT,
        max_length: col.CHARACTER_MAXIMUM_LENGTH,
        precision: col.NUMERIC_PRECISION,
        scale: col.NUMERIC_SCALE,
        comment: col.COLUMN_COMMENT || '',
        key: col.COLUMN_KEY || '',
        extra: col.EXTRA || '',
      })
    );
  }
}
