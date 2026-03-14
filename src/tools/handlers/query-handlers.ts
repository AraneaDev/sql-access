/**
 * Query Tool Handlers
 * Handles sql_query, sql_batch_query, and sql_analyze_performance
 */

import type {
 SQLQueryArgs,
 SQLBatchQueryArgs,
 SQLAnalyzePerformanceArgs,
 MCPToolResponse
} from '../../types/index.js';
import { SecurityViolationError } from '../../types/index.js';
import { formatTableResults, formatCondensedTableResults } from '../../utils/response-formatter.js';
import type { ToolHandlerContext } from './types.js';

export async function handleSqlQuery(ctx: ToolHandlerContext, args: SQLQueryArgs): Promise<MCPToolResponse> {
 const { database, query, params = [] } = args;

 try {
 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) {
 throw new Error(`Database configuration '${database}' not found`);
 }

 // Security validation for SELECT-only mode
 if (dbConfig.select_only) {
 const validation = ctx.securityManager.validateSelectOnlyQuery(query, dbConfig.type);
 if (!validation.allowed) {
 throw new SecurityViolationError(
 `Query blocked: Database '${database}' is configured for SELECT-only access. ${validation.reason}`,
 { database, query: query.substring(0, 100), reason: validation.reason }
 );
 }
 }

 if (dbConfig.ssh_host) {
 ctx.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
 }

 const result = await ctx.connectionManager.executeQuery(database, query, params);

 // Capture schema if not cached
 if (!ctx.schemaManager.hasSchema(database)) {
 try {
 const connection = await ctx.connectionManager.getConnection(database);
 if (connection) {
 await ctx.schemaManager.captureSchema(database, dbConfig);
 }
 } catch (error) {
 ctx.logger.warning('Failed to capture schema', { database, error: error instanceof Error ? error.message : 'Unknown error' });
 }
 }

 let responseText = ` Query executed successfully on ${database}\n`;
 if (ctx.sshTunnelManager.hasTunnel(database)) responseText += ` Connected via SSH tunnel\n`;
 if (dbConfig.select_only) responseText += ` SELECT-only mode active\n`;
 responseText += ` Results: ${result.rowCount} rows`;
 if (result.truncated) responseText += ` (limited to ${result.rows.length})`;
 responseText += '\n\n';

 if (result.rows.length > 0) {
 responseText += formatTableResults(result);
 } else {
 responseText += 'No results returned.\n';
 }

 return {
 content: [{ type: "text", text: responseText }],
 _meta: { progressToken: null }
 };

 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 let responseText = ` Query failed on ${database}: ${errorMessage}`;

 if (error instanceof SecurityViolationError) {
 responseText += '\n\n **Security Information:**\n';
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

export async function handleBatchQuery(ctx: ToolHandlerContext, args: SQLBatchQueryArgs): Promise<MCPToolResponse> {
 const { database, queries, transaction = false } = args;

 if (!queries || queries.length === 0) {
 throw new Error('No queries provided for batch execution');
 }

 const maxBatchSize = ctx.config.extension?.max_batch_size || 10;
 if (queries.length > maxBatchSize) {
 throw new Error(`Batch size exceeds maximum of ${maxBatchSize} queries`);
 }

 try {
 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) {
 throw new Error(`Database configuration '${database}' not found`);
 }

 if (dbConfig.select_only) {
 for (const query of queries) {
 const validation = ctx.securityManager.validateSelectOnlyQuery(query.query, dbConfig.type);
 if (!validation.allowed) {
 throw new SecurityViolationError(
 `Batch contains blocked query: ${validation.reason}`,
 { database, query: query.query.substring(0, 100), reason: validation.reason }
 );
 }
 }
 }

 if (dbConfig.ssh_host) {
 ctx.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
 }

 const result = await ctx.connectionManager.executeBatch(database, queries, transaction && !dbConfig.select_only);

 let responseText = ` **Batch Query Results** (${database})\n\n`;
 responseText += `**Execution Summary:**\n`;
 responseText += ` - Total Time: ${result.totalExecutionTime}ms\n`;
 responseText += ` - Queries Executed: ${result.results.length}\n`;
 responseText += ` - Successful: ${result.successCount} [OK]\n`;
 responseText += ` - Failed: ${result.failureCount} ${result.failureCount > 0 ? '[ERROR]' : '[OK]'}\n`;

 if (transaction && !dbConfig.select_only) {
 responseText += ` - Transaction: ${result.transactionUsed ? 'Committed' : 'Used'} [OK]\n`;
 }
 if (dbConfig.select_only) {
 responseText += ` - Security: SELECT-only mode active [LOCK]\n`;
 }
 if (ctx.sshTunnelManager.hasTunnel(database)) {
 responseText += ` - Connection: SSH tunnel [OK]\n`;
 }

 responseText += `\n **Individual Results:**\n\n`;

 for (const queryResult of result.results) {
 responseText += `**${queryResult.label || `Query ${queryResult.index}`}**:\n`;

 if (queryResult.success && queryResult.data) {
 responseText += `[OK] Success`;
 if (queryResult.data.execution_time_ms) {
 responseText += ` (${queryResult.data.execution_time_ms}ms)`;
 }
 responseText += `\n`;

 if (queryResult.data.rows && queryResult.data.rows.length > 0) {
 responseText += ` Results: ${queryResult.data.rowCount} rows`;
 if (queryResult.data.truncated) {
 responseText += ` (showing ${queryResult.data.rows.length})`;
 }
 responseText += '\n';
 responseText += formatCondensedTableResults(queryResult.data);
 } else {
 responseText += ' No results returned\n';
 }
 } else {
 responseText += `[ERROR] Failed: ${queryResult.error}\n`;
 }

 responseText += ` Query: \`${queryResult.query?.substring(0, 100)}${queryResult.query && queryResult.query.length > 100 ? '...' : ''}\`\n\n`;
 }

 return {
 content: [{ type: "text", text: responseText }],
 _meta: { progressToken: null }
 };

 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 let responseText = ` **Batch Query Failed** (${database})\n\n`;
 responseText += ` **Error:** ${errorMessage}\n\n`;

 if (error instanceof SecurityViolationError) {
 responseText += '\n **Security Information:**\n';
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

export async function handleAnalyzePerformance(ctx: ToolHandlerContext, args: SQLAnalyzePerformanceArgs): Promise<MCPToolResponse> {
 const { database, query } = args;

 try {
 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) {
 throw new Error(`Database configuration '${database}' not found`);
 }

 if (dbConfig.ssh_host) {
 ctx.logger.info(`SSH tunnel will be managed by ConnectionManager for '${database}'`);
 }

 const analysis = await ctx.connectionManager.analyzePerformance(database, query);

 let responseText = ` **Query Performance Analysis** (${database})\n\n`;
 responseText += `**Execution Times:**\n`;
 responseText += ` - Query Execution: ${analysis.executionTime}ms\n`;
 responseText += ` - Explain Analysis: ${analysis.explainTime}ms\n\n`;

 responseText += `**Query Results:**\n`;
 responseText += ` - Rows Returned: ${analysis.rowCount}\n`;
 responseText += ` - Columns: ${analysis.columnCount}\n\n`;

 responseText += ` **Execution Plan:**\n`;
 responseText += '```\n';
 responseText += analysis.executionPlan;
 responseText += '```\n\n';

 responseText += ` **Performance Recommendations:**\n`;
 responseText += analysis.recommendations;

 return {
 content: [{ type: "text", text: responseText }],
 _meta: { progressToken: null }
 };

 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 return {
 content: [{ type: "text", text: ` Performance analysis failed for ${database}: ${errorMessage}` }],
 isError: true,
 _meta: { progressToken: null }
 };
 }
}
