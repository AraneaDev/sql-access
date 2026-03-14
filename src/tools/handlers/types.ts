/**
 * Shared types for tool handlers
 */

import type { ConnectionManager } from '../../classes/ConnectionManager.js';
import type { SecurityManager } from '../../classes/SecurityManager.js';
import type { SchemaManager } from '../../classes/SchemaManager.js';
import type { EnhancedSSHTunnelManager } from '../../classes/EnhancedSSHTunnelManager.js';
import type { ParsedServerConfig, MCPToolResponse } from '../../types/index.js';
import type { Logger } from '../../utils/logger.js';

export interface ToolHandlerContext {
 connectionManager: ConnectionManager;
 securityManager: SecurityManager;
 schemaManager: SchemaManager;
 sshTunnelManager: EnhancedSSHTunnelManager;
 config: ParsedServerConfig;
 configPath: string;
 logger: Logger;
}
