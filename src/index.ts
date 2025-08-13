#!/usr/bin/env node

/**
 * SQL MCP Server - Main Entry Point
 * TypeScript implementation of the SQL Model Context Protocol Server
 * 
 * This server provides secure database connectivity through MCP protocol,
 * enabling AI assistants to interact with SQL databases with built-in
 * security controls and schema awareness.
 */

import { SQLMCPServer } from './classes/SQLMCPServer.js';
import { Logger, initializeLogger } from './utils/logger.js';

// Initialize logger for main process with console disabled for MCP mode
const logger = new Logger({ 
  component: 'Main',
  enableConsole: false  // Disable console output for MCP protocol
});

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  // Initialize global logger for all components BEFORE creating any other components
  await initializeLogger({ 
    enableConsole: false,  // Critical: Disable console output to prevent JSON-RPC interference
    logFile: './sql-mcp-server.log',
    logLevel: 'INFO'
  });
  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
    process.exit(1);
  });

  // Initialize and run server
  const server = new SQLMCPServer();

  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    
    try {
      await server.cleanup();
      logger.info('Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error as Error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Start the server
  try {
    await server.run();
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('Fatal error in main process:', error);
  process.exit(1);
});
