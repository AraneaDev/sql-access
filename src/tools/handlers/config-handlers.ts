/**
 * Config Tool Handlers
 * Handles sql_add_database, sql_update_database, sql_remove_database,
 * sql_get_config, sql_set_mcp_configurable
 */

import type { DatabaseConfig, MCPToolResponse } from '../../types/index.js';
import { saveConfigFile } from '../../utils/config.js';
import type { ToolHandlerContext } from './types.js';

function getDefaultPort(type: string): number {
 switch (type.toLowerCase()) {
 case 'mysql': return 3306;
 case 'postgresql':
 case 'postgres': return 5432;
 case 'mssql':
 case 'sqlserver': return 1433;
 default: return 0;
 }
}

export async function handleAddDatabase(ctx: ToolHandlerContext, args: Record<string, unknown>): Promise<MCPToolResponse> {
 const name = args.name as string;

 if (ctx.config.databases[name]) {
 throw new Error(`Database '${name}' already exists. Use sql_update_database to modify it.`);
 }

 const dbType = (args.type as string).toLowerCase();
 const validTypes = ['mysql', 'postgresql', 'postgres', 'sqlite', 'mssql', 'sqlserver'];
 if (!validTypes.includes(dbType)) {
 throw new Error(`Invalid database type '${dbType}'. Valid types: ${validTypes.join(', ')}`);
 }

 const dbConfig: DatabaseConfig = {
 type: dbType as DatabaseConfig['type'],
 select_only: args.select_only !== false,
 mcp_configurable: true
 };

 if (dbType === 'sqlite') {
 if (!args.file) throw new Error("SQLite databases require 'file' parameter");
 dbConfig.file = args.file as string;
 } else {
 if (!args.host) throw new Error(`Database type '${dbType}' requires 'host' parameter`);
 if (!args.username) throw new Error(`Database type '${dbType}' requires 'username' parameter`);
 dbConfig.host = args.host as string;
 dbConfig.port = (args.port as number) || getDefaultPort(dbType);
 dbConfig.database = args.database as string;
 dbConfig.username = args.username as string;
 dbConfig.password = args.password as string;
 dbConfig.ssl = (args.ssl as boolean) || false;
 dbConfig.timeout = 30000;
 }

 if (args.ssh_host) {
 dbConfig.ssh_host = args.ssh_host as string;
 dbConfig.ssh_port = (args.ssh_port as number) || 22;
 dbConfig.ssh_username = args.ssh_username as string;
 dbConfig.ssh_password = args.ssh_password as string;
 dbConfig.ssh_private_key = args.ssh_private_key as string;
 }

 ctx.config.databases[name] = dbConfig;
 ctx.connectionManager.registerDatabase(name, dbConfig);

 saveConfigFile(ctx.config, ctx.configPath);
 ctx.logger.info(`Database '${name}' added via MCP`, { type: dbType });

 return {
 content: [{
 type: "text",
 text: ` Database '${name}' added successfully (type: ${dbType})\n` +
 ` MCP configurable: yes (can be locked via sql_set_mcp_configurable)\n` +
 ` SELECT-only: ${dbConfig.select_only ? 'yes' : 'no'}\n` +
 `Use sql_test_connection to verify connectivity.`
 }],
 _meta: { progressToken: null }
 };
}

export async function handleUpdateDatabase(ctx: ToolHandlerContext, args: Record<string, unknown>): Promise<MCPToolResponse> {
 const database = args.database as string;

 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) throw new Error(`Database '${database}' not found`);

 if (!dbConfig.mcp_configurable) {
 throw new Error(
 `Database '${database}' is not MCP-configurable. ` +
 `Set mcp_configurable=true in config.ini manually to enable MCP configuration.`
 );
 }

 const updated: string[] = [];

 if (args.host !== undefined) { dbConfig.host = args.host as string; updated.push('host'); }
 if (args.port !== undefined) { dbConfig.port = args.port as number; updated.push('port'); }
 if (args.database_name !== undefined) { dbConfig.database = args.database_name as string; updated.push('database'); }
 if (args.username !== undefined) { dbConfig.username = args.username as string; updated.push('username'); }
 if (args.password !== undefined) { dbConfig.password = args.password as string; updated.push('password'); }
 if (args.file !== undefined) { dbConfig.file = args.file as string; updated.push('file'); }
 if (args.ssl !== undefined) { dbConfig.ssl = args.ssl as boolean; updated.push('ssl'); }
 if (args.select_only !== undefined) { dbConfig.select_only = args.select_only as boolean; updated.push('select_only'); }

 if (args.ssh_host !== undefined) { dbConfig.ssh_host = args.ssh_host as string; updated.push('ssh_host'); }
 if (args.ssh_port !== undefined) { dbConfig.ssh_port = args.ssh_port as number; updated.push('ssh_port'); }
 if (args.ssh_username !== undefined) { dbConfig.ssh_username = args.ssh_username as string; updated.push('ssh_username'); }
 if (args.ssh_password !== undefined) { dbConfig.ssh_password = args.ssh_password as string; updated.push('ssh_password'); }
 if (args.ssh_private_key !== undefined) { dbConfig.ssh_private_key = args.ssh_private_key as string; updated.push('ssh_private_key'); }

 if (updated.length === 0) {
 return {
 content: [{ type: "text", text: `No changes provided for database '${database}'.` }],
 _meta: { progressToken: null }
 };
 }

 ctx.connectionManager.unregisterDatabase(database);
 ctx.connectionManager.registerDatabase(database, dbConfig);

 saveConfigFile(ctx.config, ctx.configPath);
 ctx.logger.info(`Database '${database}' updated via MCP`, { fields: updated });

 return {
 content: [{
 type: "text",
 text: ` Database '${database}' updated successfully\n` +
 ` Changed fields: ${updated.join(', ')}\n` +
 `Use sql_test_connection to verify connectivity with new settings.`
 }],
 _meta: { progressToken: null }
 };
}

export async function handleRemoveDatabase(ctx: ToolHandlerContext, database: string): Promise<MCPToolResponse> {
 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) throw new Error(`Database '${database}' not found`);

 if (!dbConfig.mcp_configurable) {
 throw new Error(
 `Database '${database}' is not MCP-configurable. ` +
 `Cannot remove databases that are not MCP-configurable. Edit config.ini manually.`
 );
 }

 ctx.connectionManager.unregisterDatabase(database);
 if (ctx.sshTunnelManager.hasTunnel(database)) {
 await ctx.sshTunnelManager.closeTunnel(database);
 }

 delete ctx.config.databases[database];

 saveConfigFile(ctx.config, ctx.configPath);
 ctx.logger.info(`Database '${database}' removed via MCP`);

 return {
 content: [{
 type: "text",
 text: ` Database '${database}' removed successfully\nConnection closed and configuration saved.`
 }],
 _meta: { progressToken: null }
 };
}

export async function handleGetConfig(ctx: ToolHandlerContext, database: string): Promise<MCPToolResponse> {
 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) throw new Error(`Database '${database}' not found`);

 const redactedConfig: Record<string, unknown> = { ...dbConfig };

 if (redactedConfig.password) redactedConfig.password = '***REDACTED***';
 if (redactedConfig.ssh_password) redactedConfig.ssh_password = '***REDACTED***';
 if (redactedConfig.ssh_private_key) redactedConfig.ssh_private_key = '***REDACTED***';
 if (redactedConfig.ssh_passphrase) redactedConfig.ssh_passphrase = '***REDACTED***';

 for (const key of Object.keys(redactedConfig)) {
 if (redactedConfig[key] === undefined) delete redactedConfig[key];
 }

 let responseText = ` Configuration for '${database}':\n\n`;
 for (const [key, value] of Object.entries(redactedConfig)) {
 if (key === 'redaction' && typeof value === 'object') {
 responseText += ` ${key}: ${JSON.stringify(value, null, 2)}\n`;
 } else {
 responseText += ` ${key}: ${value}\n`;
 }
 }
 responseText += `\n MCP configurable: ${dbConfig.mcp_configurable ? 'yes' : 'no'}`;

 return {
 content: [{ type: "text", text: responseText }],
 _meta: { progressToken: null }
 };
}

export async function handleSetMcpConfigurable(ctx: ToolHandlerContext, database: string, enabled: boolean): Promise<MCPToolResponse> {
 const dbConfig = ctx.config.databases[database];
 if (!dbConfig) throw new Error(`Database '${database}' not found`);

 if (enabled === true) {
 return {
 content: [{
 type: "text",
 text: ` Cannot enable MCP configurability via MCP tools.\n` +
 `For security, setting mcp_configurable=true must be done by manually editing config.ini.\n` +
 `This prevents an AI from re-enabling its own configuration access after a human locks it.\n\n` +
 `To unlock, add this to config.ini under [database.${database}]:\n` +
 `mcp_configurable=true`
 }],
 isError: true,
 _meta: { progressToken: null }
 };
 }

 dbConfig.mcp_configurable = false;

 saveConfigFile(ctx.config, ctx.configPath);
 ctx.logger.info(`Database '${database}' locked from MCP configuration`);

 return {
 content: [{
 type: "text",
 text: ` Database '${database}' is now locked from MCP configuration changes.\n` +
 `To re-enable MCP configuration, manually set mcp_configurable=true in config.ini.`
 }],
 _meta: { progressToken: null }
 };
}
