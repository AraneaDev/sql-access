/**
 * Enhanced logging utilities for SQL MCP Server
 */
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { WriteStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

/**
 * Logger configuration interface
 */
interface LoggerConfig {
 logFile?: string;
 enableConsole?: boolean;
 enableFile?: boolean;
 rotateOnStart?: boolean;
 maxLogSize?: number;
 logLevel?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
 timestampFormat?: 'iso' | 'short' | 'none';
 component?: string;
}

/**
 * Log entry interface
 */
interface LogEntry {
 timestamp: Date;
 level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
 message: string;
 context?: Record<string, unknown>;
}

// ============================================================================
// Logger Class
// ============================================================================

/**
 *
 */
export class Logger {
 private config: Required<LoggerConfig>;
 private logStream?: WriteStream;
 private initialized = false;

 constructor(config: LoggerConfig = {}) {
 this.config = {
 logFile: join(PROJECT_ROOT, 'mcp-server.log'),
 enableConsole: true,
 enableFile: true,
 rotateOnStart: true,
 maxLogSize: 10 * 1024 * 1024, // 10MB
 logLevel: 'INFO',
 timestampFormat: 'iso',
 component: 'default',
 ...config
 };
 }

 /**
  * Initialize the logger
  */
 async initialize(): Promise<void> {
 if (this.initialized) return;

 if (this.config.enableFile) {
 if (this.config.rotateOnStart) {
 this.rotateLogFile();
 }
 this.createLogStream();
 }

 this.initialized = true;
 this.info('Logger initialized', { config: this.sanitizeConfig() });
 }

 /**
  * Clean up logger resources
  */
 async cleanup(): Promise<void> {
 if (this.logStream) {
 await new Promise<void>((resolve) => {
 this.logStream!.end(resolve);
 });
 this.logStream = undefined;
 }
 this.initialized = false;
 }

 // ============================================================================
 // Logging Methods
 // ============================================================================

 /**
  *
  */
 info(message: string, context?: Record<string, unknown>): void {
 this.log('INFO', message, context);
 }

 /**
  *
  */
 warning(message: string, context?: Record<string, unknown>): void {
 this.log('WARNING', message, context);
 }

 /**
  *
  */
 error(message: string, contextOrError?: Record<string, unknown> | Error): void {
 let actualContext: Record<string, unknown> = {};
 
 if (contextOrError) {
 if (contextOrError instanceof Error) {
 actualContext.error = this.serializeError(contextOrError);
 } else {
 actualContext = contextOrError;
 }
 }
 
 this.log('ERROR', message, actualContext);
 }

 /**
  *
  */
 critical(message: string, contextOrError?: Record<string, unknown> | Error): void {
 let actualContext: Record<string, unknown> = {};
 
 if (contextOrError) {
 if (contextOrError instanceof Error) {
 actualContext.error = this.serializeError(contextOrError);
 } else {
 actualContext = contextOrError;
 }
 }
 
 this.log('CRITICAL', message, actualContext);
 }

 /**
  *
  */
 debug(message: string, context?: Record<string, unknown>): void {
 // Debug logs are only shown when log level is INFO or lower
 if (this.shouldLog('INFO')) {
 this.log('INFO', `[DEBUG] ${message}`, context);
 }
 }

 // ============================================================================
 // Core Logging Method
 // ============================================================================

 private log(level: LogEntry['level'], message: string, context?: Record<string, unknown>): void {
 if (!this.shouldLog(level)) return;

 const entry: LogEntry = {
 timestamp: new Date(),
 level,
 message,
 context
 };

 const formattedMessage = this.formatLogEntry(entry);

 // Console output with EPIPE protection
 if (this.config.enableConsole) {
 this.safeConsoleOutput(level, formattedMessage);
 }

 // File output
 if (this.config.enableFile && this.logStream) {
 try {
 this.logStream.write(formattedMessage + '\n');
 } catch (error) {
 // Ignore write errors to avoid cascading failures
 if (error && typeof error === 'object' && 'code' in error && error.code !== 'EPIPE') {
 // Only log non-EPIPE errors to stderr as last resort
 try {
 process.stderr.write(`Logger write error: ${error}\n`);
 } catch (e) {
 // Completely ignore if even stderr fails
 }
 }
 }
 }
 }

 // ============================================================================
 // Utility Methods
 // ============================================================================

 private shouldLog(level: LogEntry['level']): boolean {
 const levels = {
 'INFO': 0,
 'WARNING': 1,
 'ERROR': 2,
 'CRITICAL': 3
 };

 return levels[level] >= levels[this.config.logLevel];
 }

 private formatLogEntry(entry: LogEntry): string {
 const timestamp = this.formatTimestamp(entry.timestamp);
 let formatted = `[${timestamp}] [${entry.level}] ${entry.message}`;

 if (entry.context && Object.keys(entry.context).length > 0) {
 formatted += ` | Context: ${JSON.stringify(entry.context)}`;
 }

 return formatted;
 }

 private formatTimestamp(date: Date): string {
 switch (this.config.timestampFormat) {
 case 'iso':
 return date.toISOString();
 case 'short':
 return date.toLocaleString();
 case 'none':
 return '';
 default:
 return date.toISOString();
 }
 }

 /**
  * Safe console output that handles EPIPE errors gracefully
  */
 private safeConsoleOutput(level: LogEntry['level'], message: string): void {
 try {
 const consoleMethod = this.getConsoleMethod(level);
 consoleMethod(message);
 } catch (error) {
 // Handle EPIPE and other console errors gracefully
 if (error && typeof error === 'object' && 'code' in error) {
 if (error.code === 'EPIPE') {
 // EPIPE means the output pipe is broken (client disconnected)
 // Disable console output to prevent further errors
 this.config.enableConsole = false;
 return;
 }
 }
 
 // For other errors, try stderr as fallback
 try {
 process.stderr.write(`Console output error: ${error}\n`);
 } catch (e) {
 // If even stderr fails, give up silently
 this.config.enableConsole = false;
 }
 }
 }

 private getConsoleMethod(level: LogEntry['level']): (..._args: unknown[]) => void {
 switch (level) {
 case 'INFO':
 return console.log;
 case 'WARNING':
 return console.warn;
 case 'ERROR':
 case 'CRITICAL':
 return console.error;
 default:
 return console.log;
 }
 }

 private rotateLogFile(): void {
 try {
 if (existsSync(this.config.logFile)) {
 unlinkSync(this.config.logFile);
 }
 } catch (error) {
 try { process.stderr.write(`Log rotation failed: ${error}\n`); } catch { /* ignore */ }
 }
 }

 private createLogStream(): void {
 try {
 this.logStream = createWriteStream(this.config.logFile, { flags: 'a' });
 
 this.logStream.on('error', (error) => {
 try { process.stderr.write(`Log stream error: ${error.message}\n`); } catch { /* ignore */ }
 });
 
 } catch (error) {
 try { process.stderr.write(`Failed to create log stream: ${error}\n`); } catch { /* ignore */ }
 this.config.enableFile = false;
 }
 }

 private serializeError(error: Error): Record<string, unknown> {
 return {
 errorName: error.name,
 errorMessage: error.message,
 stack: error.stack,
 // Include other enumerable properties from the error
 ...(error.constructor !== Error ? { constructor: error.constructor.name } : {})
 };
 }

 private sanitizeConfig(): Partial<LoggerConfig> {
 // Return config without sensitive information
 return {
 logFile: this.config.logFile,
 enableConsole: this.config.enableConsole,
 enableFile: this.config.enableFile,
 logLevel: this.config.logLevel
 };
 }
}

// ============================================================================
// Global Logger Instance
// ============================================================================

let globalLogger: Logger | undefined;

/**
 *
 */
export function getLogger(config?: LoggerConfig): Logger {
 if (!globalLogger) {
 globalLogger = new Logger(config);
 }
 return globalLogger;
}

/**
 *
 */
export async function initializeLogger(config?: LoggerConfig): Promise<Logger> {
 const logger = getLogger(config);
 await logger.initialize();
 return logger;
}

/**
 *
 */
export async function cleanupLogger(): Promise<void> {
 if (globalLogger) {
 await globalLogger.cleanup();
 globalLogger = undefined;
 }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 *
 */
export function log(message: string, context?: Record<string, unknown>): void {
 getLogger().info(message, context);
}

/**
 *
 */
export function logError(message: string, contextOrError?: Record<string, unknown> | Error): void {
 getLogger().error(message, contextOrError);
}

/**
 *
 */
export function logWarning(message: string, context?: Record<string, unknown>): void {
 getLogger().warning(message, context);
}

/**
 *
 */
export function logCritical(message: string, contextOrError?: Record<string, unknown> | Error): void {
 getLogger().critical(message, contextOrError);
}

/**
 *
 */
export function logDebug(message: string, context?: Record<string, unknown>): void {
 getLogger().debug(message, context);
}
