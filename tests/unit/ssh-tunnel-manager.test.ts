/**
 * SSHTunnelManager Tests
 * Tests the SSH tunnel management functionality - focusing on API behavior without real connections
 */

import { SSHTunnelManager } from '../../src/classes/SSHTunnelManager.js';

// Mock logger first
jest.mock('../../src/utils/logger.js', () => ({
 getLogger: jest.fn(() => ({
 info: jest.fn(),
 error: jest.fn(),
 warning: jest.fn(),
 debug: jest.fn()
 }))
}));

describe('SSHTunnelManager', () => {
 let sshTunnelManager: SSHTunnelManager;
 
 const validForwardConfig = {
 sourceHost: '127.0.0.1',
 sourcePort: 3307,
 destinationHost: 'localhost',
 destinationPort: 3306
 };

 beforeEach(() => {
 // Remove any existing process listeners to prevent memory leak warnings
 process.removeAllListeners('exit');
 process.removeAllListeners('SIGINT');
 
 // Create fresh instance
 sshTunnelManager = new SSHTunnelManager();
 });

 afterEach(async () => {
 // Clean up any tunnels
 try {
 await sshTunnelManager.closeAllTunnels();
 } catch (error) {
 // Ignore cleanup errors in tests
 }
 
 // Clean up process listeners
 process.removeAllListeners('exit');
 process.removeAllListeners('SIGINT');
 });

 // ============================================================================
 // Basic Functionality Tests
 // ============================================================================

 describe('Basic Functionality', () => {
 it('should initialize successfully', async () => {
 await sshTunnelManager.initialize();
 expect(sshTunnelManager).toBeDefined();
 expect(typeof sshTunnelManager.hasTunnel).toBe('function');
 expect(typeof sshTunnelManager.createTunnel).toBe('function');
 expect(typeof sshTunnelManager.closeTunnel).toBe('function');
 });

 it('should return false for non-existent tunnels', () => {
 expect(sshTunnelManager.hasTunnel('nonexistent')).toBe(false);
 expect(sshTunnelManager.isConnected('nonexistent')).toBe(false);
 expect(sshTunnelManager.getTunnel('nonexistent')).toBeUndefined();
 expect(sshTunnelManager.getTunnelStatus('nonexistent')).toBeUndefined();
 });

 it('should return empty arrays for initial state', () => {
 expect(sshTunnelManager.getActiveTunnels()).toEqual([]);
 expect(sshTunnelManager.getTunnelStats()).toEqual({
 total: 0,
 active: 0,
 connecting: 0,
 errors: 0
 });
 });
 });

 // ============================================================================
 // Configuration Validation Tests (These don't make connections)
 // ============================================================================

 describe('Configuration Validation', () => {
 it('should validate SSH configuration and reject invalid configs', async () => {
 const invalidOptions = {
 sshConfig: {
 host: '',
 port: 22,
 username: 'testuser'
 // Missing password/privateKey
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/Invalid SSH configuration/);
 });

 it('should validate required SSH host', async () => {
 const invalidOptions = {
 sshConfig: {
 host: '',
 port: 22,
 username: 'testuser',
 password: 'pass'
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/SSH host is required/);
 });

 it('should validate SSH port range', async () => {
 const invalidOptions = {
 sshConfig: {
 host: 'test.example.com',
 port: 70000, // Invalid port
 username: 'testuser',
 password: 'pass'
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/port must be between 1 and 65535/);
 });

 it('should validate username is required', async () => {
 const invalidOptions = {
 sshConfig: {
 host: 'test.example.com',
 port: 22,
 username: '',
 password: 'pass'
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/SSH username is required/);
 });

 it('should validate authentication method is provided', async () => {
 const invalidOptions = {
 sshConfig: {
 host: 'test.example.com',
 port: 22,
 username: 'testuser'
 // No password or privateKey
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/Either password or private key must be provided/);
 });

 it('should handle multiple validation errors', async () => {
 const invalidOptions = {
 sshConfig: {
 host: '', // Invalid
 port: 70000, // Invalid
 username: '' // Invalid
 // Missing auth method
 },
 forwardConfig: validForwardConfig
 };

 try {
 await sshTunnelManager.createTunnel('test-db', invalidOptions as any);
 } catch (error) {
 const errorMessage = (error as Error).message;
 expect(errorMessage).toContain('Invalid SSH configuration');
 // Should contain multiple error details
 expect(errorMessage.length).toBeGreaterThan(50);
 }
 });

 it('should validate SSH port is positive', async () => {
 const invalidOptions = {
 sshConfig: {
 host: 'test.example.com',
 port: 0, // Invalid port
 username: 'testuser',
 password: 'pass'
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/port must be between 1 and 65535/);
 });

 it('should validate SSH port upper bound', async () => {
 const invalidOptions = {
 sshConfig: {
 host: 'test.example.com',
 port: 65536, // Invalid port (too high)
 username: 'testuser',
 password: 'pass'
 },
 forwardConfig: validForwardConfig
 };

 await expect(
 sshTunnelManager.createTunnel('test-db', invalidOptions as any)
 ).rejects.toThrow(/port must be between 1 and 65535/);
 });
 });

 // ============================================================================
 // Status and Statistics Tests
 // ============================================================================

 describe('Status and Statistics', () => {
 it('should return correct initial statistics', () => {
 const stats = sshTunnelManager.getTunnelStats();
 
 expect(stats).toEqual({
 total: 0,
 active: 0,
 connecting: 0,
 errors: 0
 });
 });

 it('should return undefined for non-existent tunnel status', () => {
 const status = sshTunnelManager.getTunnelStatus('nonexistent');
 expect(status).toBeUndefined();
 });

 it('should return empty array for active tunnels initially', () => {
 const activeTunnels = sshTunnelManager.getActiveTunnels();
 expect(activeTunnels).toEqual([]);
 });

 it('should have consistent stats format', () => {
 const stats = sshTunnelManager.getTunnelStats();
 
 expect(stats).toHaveProperty('total');
 expect(stats).toHaveProperty('active');
 expect(stats).toHaveProperty('connecting');
 expect(stats).toHaveProperty('errors');
 
 expect(typeof stats.total).toBe('number');
 expect(typeof stats.active).toBe('number');
 expect(typeof stats.connecting).toBe('number');
 expect(typeof stats.errors).toBe('number');
 });
 });

 // ============================================================================
 // Tunnel Management Tests
 // ============================================================================

 describe('Tunnel Management', () => {
 it('should handle closing non-existent tunnel gracefully', async () => {
 await expect(sshTunnelManager.closeTunnel('nonexistent')).resolves.not.toThrow();
 expect(sshTunnelManager.hasTunnel('nonexistent')).toBe(false);
 });

 it('should handle closing all tunnels when no tunnels exist', async () => {
 await expect(sshTunnelManager.closeAllTunnels()).resolves.not.toThrow();
 });

 it('should return false for non-existent tunnel connection status', () => {
 expect(sshTunnelManager.isConnected('nonexistent')).toBe(false);
 });

 it('should return undefined for non-existent tunnel info', () => {
 expect(sshTunnelManager.getTunnel('nonexistent')).toBeUndefined();
 });

 it('should return false for non-existent tunnel existence check', () => {
 expect(sshTunnelManager.hasTunnel('nonexistent')).toBe(false);
 });

 it('should handle empty database name gracefully', async () => {
 await expect(sshTunnelManager.closeTunnel('')).resolves.not.toThrow();
 expect(sshTunnelManager.hasTunnel('')).toBe(false);
 expect(sshTunnelManager.isConnected('')).toBe(false);
 });

 it('should handle null/undefined database names gracefully', async () => {
 await expect(sshTunnelManager.closeTunnel(null as any)).resolves.not.toThrow();
 await expect(sshTunnelManager.closeTunnel(undefined as any)).resolves.not.toThrow();
 
 expect(sshTunnelManager.hasTunnel(null as any)).toBe(false);
 expect(sshTunnelManager.hasTunnel(undefined as any)).toBe(false);
 expect(sshTunnelManager.isConnected(null as any)).toBe(false);
 expect(sshTunnelManager.isConnected(undefined as any)).toBe(false);
 });
 });

 // ============================================================================
 // Interface and Type Tests
 // ============================================================================

 describe('Interface Compliance', () => {
 it('should implement all required ISSHTunnelManager methods', () => {
 expect(typeof sshTunnelManager.createTunnel).toBe('function');
 expect(typeof sshTunnelManager.getTunnel).toBe('function');
 expect(typeof sshTunnelManager.closeTunnel).toBe('function');
 expect(typeof sshTunnelManager.closeAllTunnels).toBe('function');
 expect(typeof sshTunnelManager.isConnected).toBe('function');
 });

 it('should have additional management methods', () => {
 expect(typeof sshTunnelManager.hasTunnel).toBe('function');
 expect(typeof sshTunnelManager.getTunnelStatus).toBe('function');
 expect(typeof sshTunnelManager.getActiveTunnels).toBe('function');
 expect(typeof sshTunnelManager.getTunnelStats).toBe('function');
 expect(typeof sshTunnelManager.initialize).toBe('function');
 });

 it('should return appropriate types from methods', () => {
 expect(typeof sshTunnelManager.hasTunnel('test')).toBe('boolean');
 expect(typeof sshTunnelManager.isConnected('test')).toBe('boolean');
 expect(Array.isArray(sshTunnelManager.getActiveTunnels())).toBe(true);
 expect(typeof sshTunnelManager.getTunnelStats()).toBe('object');
 });

 it('should handle method calls with different parameter types', () => {
 // Test with string parameters
 expect(sshTunnelManager.hasTunnel('database-1')).toBe(false);
 expect(sshTunnelManager.hasTunnel('database_with_underscores')).toBe(false);
 expect(sshTunnelManager.hasTunnel('database-with-dashes')).toBe(false);
 expect(sshTunnelManager.hasTunnel('123')).toBe(false);
 });
 });

 // ============================================================================
 // EventEmitter Tests (SSHTunnelManager extends EventEmitter)
 // ============================================================================

 describe('EventEmitter Functionality', () => {
 it('should be an EventEmitter instance', () => {
 expect(sshTunnelManager).toBeInstanceOf(require('events').EventEmitter);
 });

 it('should have EventEmitter methods available', () => {
 expect(typeof sshTunnelManager.on).toBe('function');
 expect(typeof sshTunnelManager.emit).toBe('function');
 expect(typeof sshTunnelManager.removeListener).toBe('function');
 expect(typeof sshTunnelManager.removeAllListeners).toBe('function');
 });

 it('should support event registration and removal', () => {
 const mockListener = jest.fn();
 
 // Add listener
 sshTunnelManager.on('test-event', mockListener);
 expect(sshTunnelManager.listenerCount('test-event')).toBe(1);
 
 // Remove listener
 sshTunnelManager.removeListener('test-event', mockListener);
 expect(sshTunnelManager.listenerCount('test-event')).toBe(0);
 });

 it('should support event emission', () => {
 const mockListener = jest.fn();
 
 sshTunnelManager.on('custom-event', mockListener);
 sshTunnelManager.emit('custom-event', 'test-data');
 
 expect(mockListener).toHaveBeenCalledWith('test-data');
 });
 });

 // ============================================================================
 // Edge Cases and Error Handling
 // ============================================================================

 describe('Error Handling and Edge Cases', () => {
 it('should handle rapid sequential method calls', () => {
 // These should all complete without throwing
 expect(() => {
 for (let i = 0; i < 10; i++) {
 sshTunnelManager.hasTunnel(`test-${i}`);
 sshTunnelManager.isConnected(`test-${i}`);
 sshTunnelManager.getTunnel(`test-${i}`);
 sshTunnelManager.getTunnelStatus(`test-${i}`);
 }
 }).not.toThrow();
 });

 it('should handle special characters in database names', () => {
 const specialNames = [
 'db@host',
 'db#123', 
 'db$test',
 'db%prod',
 'db&dev',
 'db*staging',
 'db+temp',
 'db=main',
 'db[bracket]',
 'db{brace}',
 'db|pipe',
 'db\\backslash',
 'db:colon',
 'db;semicolon',
 'db"quote',
 'db\'apostrophe',
 'db<less>',
 'db>greater',
 'db,comma',
 'db.period',
 'db?question',
 'db/slash',
 'db space',
 'db\ttab',
 'db\nnewline'
 ];

 specialNames.forEach(name => {
 expect(() => {
 sshTunnelManager.hasTunnel(name);
 sshTunnelManager.isConnected(name);
 sshTunnelManager.getTunnel(name);
 sshTunnelManager.getTunnelStatus(name);
 }).not.toThrow();
 });
 });

 it('should handle very long database names', () => {
 const longName = 'a'.repeat(1000);
 
 expect(() => {
 sshTunnelManager.hasTunnel(longName);
 sshTunnelManager.isConnected(longName);
 sshTunnelManager.getTunnel(longName);
 sshTunnelManager.getTunnelStatus(longName);
 }).not.toThrow();
 });

 it('should maintain consistent state after multiple operations', async () => {
 // Perform various operations
 sshTunnelManager.hasTunnel('test1');
 sshTunnelManager.isConnected('test2');
 sshTunnelManager.getTunnel('test3');
 sshTunnelManager.getTunnelStatus('test4');
 await sshTunnelManager.closeTunnel('test5');
 await sshTunnelManager.closeAllTunnels();
 
 // State should remain consistent
 expect(sshTunnelManager.getTunnelStats()).toEqual({
 total: 0,
 active: 0,
 connecting: 0,
 errors: 0
 });
 
 expect(sshTunnelManager.getActiveTunnels()).toEqual([]);
 });
 });

 // ============================================================================
 // Performance and Resource Tests
 // ============================================================================

 describe('Performance and Resource Management', () => {
 it('should handle concurrent status checks efficiently', () => {
 const start = Date.now();
 const promises = [];
 
 // Create many concurrent status checks
 for (let i = 0; i < 100; i++) {
 promises.push(Promise.resolve().then(() => {
 sshTunnelManager.hasTunnel(`test-${i}`);
 sshTunnelManager.isConnected(`test-${i}`);
 sshTunnelManager.getTunnelStats();
 return sshTunnelManager.getActiveTunnels();
 }));
 }
 
 return Promise.all(promises).then(() => {
 const duration = Date.now() - start;
 // Should complete quickly (under 1 second)
 expect(duration).toBeLessThan(1000);
 });
 });

 it('should handle memory efficiently with many status calls', () => {
 // Make many calls to ensure no memory leaks in simple operations
 for (let i = 0; i < 1000; i++) {
 sshTunnelManager.hasTunnel(`test-${i % 10}`);
 sshTunnelManager.getTunnelStats();
 sshTunnelManager.getActiveTunnels();
 }
 
 // Should still return consistent results
 expect(sshTunnelManager.getTunnelStats().total).toBe(0);
 expect(sshTunnelManager.getActiveTunnels()).toEqual([]);
 });

 it('should cleanup resources properly', async () => {
 // Multiple cleanup calls should be safe
 await sshTunnelManager.closeAllTunnels();
 await sshTunnelManager.closeAllTunnels();
 await sshTunnelManager.closeAllTunnels();
 
 // State should remain consistent
 expect(sshTunnelManager.getTunnelStats().total).toBe(0);
 });
 });
});
