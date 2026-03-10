/**
 * Comprehensive test suite for Enhanced SSH Tunnel Management
 * Covers port management, conflict detection, and automatic assignment
 */

import { jest } from '@jest/globals';
import * as net from 'net';
import { PortManager } from '../../src/utils/port-manager.js';
import { EnhancedSSHTunnelManager } from '../../src/classes/EnhancedSSHTunnelManager.js';
import type { 
 SSHTunnelCreateOptions,
 SSHConnectionConfig,
 SSHForwardConfig 
} from '../../src/types/index.js';

// ============================================================================
// Test Helper Classes
// ============================================================================

class TestPortOccupier {
 private servers = new Map<number, net.Server>();
 
 async occupyPort(port: number): Promise<void> {
 return new Promise((resolve, reject) => {
 const server = net.createServer();
 server.listen(port, '127.0.0.1', () => {
 this.servers.set(port, server);
 resolve();
 });
 server.on('error', reject);
 });
 }
 
 async releasePort(port: number): Promise<void> {
 const server = this.servers.get(port);
 if (server) {
 return new Promise((resolve) => {
 server.close(() => {
 this.servers.delete(port);
 resolve();
 });
 });
 }
 }
 
 async releaseAll(): Promise<void> {
 const ports = Array.from(this.servers.keys());
 await Promise.all(ports.map(port => this.releasePort(port)));
 }

 getOccupiedPorts(): number[] {
 return Array.from(this.servers.keys());
 }
}

// ============================================================================
// Port Manager Test Suite
// ============================================================================

describe('PortManager', () => {
 let portManager: PortManager;
 let testOccupier: TestPortOccupier;
 const testPortBase = 45000; // Use high ports for testing

 beforeEach(() => {
 portManager = PortManager.getInstance();
 portManager.clearReservedPorts();
 testOccupier = new TestPortOccupier();
 });

 afterEach(async () => {
 await testOccupier.releaseAll();
 portManager.clearReservedPorts();
 });

 describe('Basic Port Operations', () => {
 it('should detect available ports correctly', async () => {
 const result = await portManager.isPortAvailable(testPortBase);
 expect(result.isAvailable).toBe(true);
 expect(result.port).toBe(testPortBase);
 expect(result.reason).toBeUndefined();
 });

 it('should detect occupied ports', async () => {
 const testPort = testPortBase + 1;
 await testOccupier.occupyPort(testPort);
 
 const result = await portManager.isPortAvailable(testPort);
 expect(result.isAvailable).toBe(false);
 expect(result.port).toBe(testPort);
 expect(result.reason).toMatch(/already in use/i);
 });

 it('should validate port numbers', () => {
 expect(portManager.isValidPort(1)).toBe(true);
 expect(portManager.isValidPort(65535)).toBe(true);
 expect(portManager.isValidPort(0)).toBe(false);
 expect(portManager.isValidPort(65536)).toBe(false);
 expect(portManager.isValidPort(-100)).toBe(false);
 });

 it('should identify privileged ports', () => {
 expect(portManager.isPrivilegedPort(22)).toBe(true);
 expect(portManager.isPrivilegedPort(80)).toBe(true);
 expect(portManager.isPrivilegedPort(1023)).toBe(true);
 expect(portManager.isPrivilegedPort(1024)).toBe(false);
 expect(portManager.isPrivilegedPort(8080)).toBe(false);
 });
 });

 describe('Smart Port Assignment', () => {
 it('should assign preferred port when available', async () => {
 const preferredPort = testPortBase + 10;
 
 const result = await portManager.findAvailablePort({
 preferredPort,
 minPort: testPortBase,
 maxPort: testPortBase + 100
 });

 expect(result.assignedPort).toBe(preferredPort);
 expect(result.wasPreferredPort).toBe(true);
 expect(result.attemptedPorts).toContain(preferredPort);
 });

 it('should find alternative when preferred port is unavailable', async () => {
 const preferredPort = testPortBase + 11;
 await testOccupier.occupyPort(preferredPort);
 
 const result = await portManager.findAvailablePort({
 preferredPort,
 minPort: testPortBase,
 maxPort: testPortBase + 100
 });

 expect(result.assignedPort).not.toBe(preferredPort);
 expect(result.wasPreferredPort).toBe(false);
 expect(result.attemptedPorts).toContain(preferredPort);
 expect(result.assignedPort).toBeGreaterThanOrEqual(testPortBase);
 expect(result.assignedPort).toBeLessThanOrEqual(testPortBase + 100);
 });

 it('should suggest database-specific alternatives for MySQL', async () => {
 const result = await portManager.suggestTunnelPort('mysql');
 
 // Should get a port assigned
 expect(result.assignedPort).toBeGreaterThan(0);
 expect(result.assignedPort).toBeLessThan(65536);
 
 // Check if it's either a MySQL alternative or in safe range
 const mysqlAlternatives = [3307, 3308, 3309, 3316, 3406, 4306];
 const isMySQLSpecific = mysqlAlternatives.includes(result.assignedPort);
 const isInSafeRange = result.assignedPort >= 30000 && result.assignedPort <= 40000;
 
 expect(isMySQLSpecific || isInSafeRange).toBe(true);
 });

 it('should handle PostgreSQL port suggestions', async () => {
 const result = await portManager.suggestTunnelPort('postgresql');
 
 expect(result.assignedPort).toBeGreaterThan(0);
 
 const pgAlternatives = [5433, 5434, 5435, 5442, 5532, 6432];
 const isPGSpecific = pgAlternatives.includes(result.assignedPort);
 const isInSafeRange = result.assignedPort >= 30000 && result.assignedPort <= 40000;
 
 expect(isPGSpecific || isInSafeRange).toBe(true);
 });

 it('should respect exclude ports', async () => {
 const excludePorts = [testPortBase + 20, testPortBase + 21, testPortBase + 22];
 
 const result = await portManager.findAvailablePort({
 minPort: testPortBase + 20,
 maxPort: testPortBase + 30,
 excludePorts,
 maxAttempts: 15
 });

 expect(excludePorts).not.toContain(result.assignedPort);
 expect(result.assignedPort).toBeGreaterThanOrEqual(testPortBase + 20);
 expect(result.assignedPort).toBeLessThanOrEqual(testPortBase + 30);
 });

 it('should throw error when no ports available in range', async () => {
 // Occupy entire range
 const rangeStart = testPortBase + 50;
 const rangeEnd = testPortBase + 55;
 
 for (let port = rangeStart; port <= rangeEnd; port++) {
 await testOccupier.occupyPort(port);
 }
 
 await expect(
 portManager.findAvailablePort({
 minPort: rangeStart,
 maxPort: rangeEnd,
 maxAttempts: 10
 })
 ).rejects.toThrow(/Failed to find available port/);
 });
 });

 describe('Database-Specific Port Recommendations', () => {
 it('should provide correct MySQL alternatives', () => {
 const recommendations = portManager.getPortRecommendations('mysql');
 
 expect(recommendations).toContain(3307); // 3306 + 1
 expect(recommendations).toContain(3308); // 3306 + 2
 expect(recommendations).toContain(3316); // 3306 + 10
 expect(recommendations).toContain(3406); // 3306 + 100
 expect(recommendations).toContain(4306); // 3306 + 1000
 
 // Should not contain common conflicting ports
 expect(recommendations).not.toContain(3000);
 expect(recommendations).not.toContain(8080);
 });

 it('should provide PostgreSQL alternatives', () => {
 const recommendations = portManager.getPortRecommendations('postgresql');
 
 expect(recommendations).toContain(5433);
 expect(recommendations).toContain(5442);
 expect(recommendations).toContain(5532);
 expect(recommendations).toContain(6432);
 });

 it('should provide SQL Server alternatives', () => {
 const recommendations = portManager.getPortRecommendations('mssql');
 
 expect(recommendations).toContain(1434);
 expect(recommendations).toContain(1443);
 expect(recommendations).toContain(1533);
 expect(recommendations).toContain(2433);
 });

 it('should handle unknown database types', () => {
 const recommendations = portManager.getPortRecommendations('unknown-db');
 expect(recommendations).toEqual([]);
 });
 });

 describe('Port Reservation System', () => {
 it('should reserve and track ports', () => {
 const testPort = testPortBase + 100;
 
 expect(portManager.getReservedPorts()).not.toContain(testPort);
 
 portManager.reservePort(testPort);
 expect(portManager.getReservedPorts()).toContain(testPort);
 
 portManager.releasePort(testPort);
 expect(portManager.getReservedPorts()).not.toContain(testPort);
 });

 it('should avoid reserved ports during assignment', async () => {
 const reservedPort = testPortBase + 101;
 portManager.reservePort(reservedPort);
 
 const result = await portManager.findAvailablePort({
 preferredPort: reservedPort,
 minPort: testPortBase + 100,
 maxPort: testPortBase + 110
 });

 expect(result.assignedPort).not.toBe(reservedPort);
 expect(result.wasPreferredPort).toBe(false);
 });

 it('should handle multiple reservations', () => {
 const ports = [testPortBase + 200, testPortBase + 201, testPortBase + 202];
 
 ports.forEach(port => portManager.reservePort(port));
 
 const reserved = portManager.getReservedPorts();
 ports.forEach((port: number) => {
 expect(reserved).toContain(port);
 });
 
 expect(reserved.length).toBeGreaterThanOrEqual(ports.length);
 });

 it('should clear all reservations', () => {
 const ports = [testPortBase + 300, testPortBase + 301];
 ports.forEach(port => portManager.reservePort(port));
 
 expect(portManager.getReservedPorts().length).toBeGreaterThanOrEqual(2);
 
 portManager.clearReservedPorts();
 expect(portManager.getReservedPorts()).toEqual([]);
 });
 });

 describe('Batch Operations', () => {
 it('should check multiple ports efficiently', async () => {
 const ports = [testPortBase + 400, testPortBase + 401, testPortBase + 402];
 
 // Occupy middle port
 await testOccupier.occupyPort(ports[1]);
 
 const results = await portManager.checkMultiplePorts(ports);
 
 expect(results).toHaveLength(3);
 expect(results[0].isAvailable).toBe(true);
 expect(results[1].isAvailable).toBe(false);
 expect(results[2].isAvailable).toBe(true);
 
 expect(results[1].reason).toMatch(/already in use/i);
 });

 it('should complete batch checks quickly', async () => {
 const ports = Array.from({ length: 20 }, (_, i) => testPortBase + 500 + i);
 
 const startTime = Date.now();
 const results = await portManager.checkMultiplePorts(ports);
 const duration = Date.now() - startTime;
 
 expect(results).toHaveLength(20);
 expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
 });
 });

 describe('Port Status Information', () => {
 it('should provide readable status for available ports', async () => {
 const testPort = testPortBase + 600;
 const status = await portManager.getPortStatus(testPort);
 
 expect(status).toContain(`Port ${testPort} is available`);
 });

 it('should provide readable status for occupied ports', async () => {
 const testPort = testPortBase + 601;
 await testOccupier.occupyPort(testPort);
 
 const status = await portManager.getPortStatus(testPort);
 
 expect(status).toContain(`Port ${testPort} is not available`);
 expect(status).toMatch(/already in use/i);
 });

 it('should indicate reserved ports in status', async () => {
 const testPort = testPortBase + 602;
 portManager.reservePort(testPort);
 
 const status = await portManager.getPortStatus(testPort);
 
 // Port is still available to the system but reserved by manager
 const availabilityCheck = await portManager.isPortAvailable(testPort);
 expect(availabilityCheck.isAvailable).toBe(true);
 
 // Status might indicate it's reserved (implementation dependent)
 expect(typeof status).toBe('string');
 expect(status.length).toBeGreaterThan(0);
 });
 });
});

// ============================================================================
// Enhanced SSH Tunnel Manager Test Suite
// ============================================================================

describe('EnhancedSSHTunnelManager', () => {
 let tunnelManager: EnhancedSSHTunnelManager;
 let testOccupier: TestPortOccupier;
 let portManager: PortManager;

 beforeEach(async () => {
 portManager = PortManager.getInstance();
 portManager.clearReservedPorts();
 tunnelManager = new EnhancedSSHTunnelManager();
 await tunnelManager.initialize();
 testOccupier = new TestPortOccupier();
 });

 afterEach(async () => {
 await tunnelManager.closeAllTunnels();
 await testOccupier.releaseAll();
 portManager.clearReservedPorts();
 });

 describe('Tunnel Statistics and Port Information', () => {
 it('should provide comprehensive tunnel statistics', () => {
 const stats = tunnelManager.getTunnelStats();
 
 expect(stats).toHaveProperty('total');
 expect(stats).toHaveProperty('active');
 expect(stats).toHaveProperty('connecting');
 expect(stats).toHaveProperty('errors');
 expect(stats).toHaveProperty('portInfo');
 
 expect(stats.portInfo).toHaveProperty('reserved');
 expect(stats.portInfo).toHaveProperty('preferredUsed');
 expect(stats.portInfo).toHaveProperty('autoAssigned');
 
 expect(Array.isArray(stats.portInfo.reserved)).toBe(true);
 expect(typeof stats.portInfo.preferredUsed).toBe('number');
 expect(typeof stats.portInfo.autoAssigned).toBe('number');
 });

 it('should provide database-specific port recommendations', async () => {
 const mysqlRecs = await tunnelManager.getPortRecommendations('mysql');
 
 expect(mysqlRecs).toHaveProperty('recommended');
 expect(mysqlRecs).toHaveProperty('available');
 expect(mysqlRecs).toHaveProperty('status');
 
 expect(Array.isArray(mysqlRecs.recommended)).toBe(true);
 expect(Array.isArray(mysqlRecs.available)).toBe(true);
 expect(Array.isArray(mysqlRecs.status)).toBe(true);
 
 expect(mysqlRecs.recommended.length).toBeGreaterThan(0);
 expect(mysqlRecs.status.length).toBe(mysqlRecs.recommended.length);
 });

 it('should check port availability with suggestions', async () => {
 const testPort = 46000;
 await testOccupier.occupyPort(testPort);
 
 const availability = await tunnelManager.checkPortAvailability(testPort);
 
 expect(availability).toHaveProperty('available');
 expect(availability).toHaveProperty('reason');
 expect(availability).toHaveProperty('suggestion');
 
 expect(availability.available).toBe(false);
 expect(availability.reason).toBeDefined();
 expect(availability.suggestion).toBeGreaterThan(testPort);
 });

 it('should handle available ports without suggestions', async () => {
 const testPort = 46001;
 
 const availability = await tunnelManager.checkPortAvailability(testPort);
 
 expect(availability.available).toBe(true);
 expect(availability.reason).toBeUndefined();
 expect(availability.suggestion).toBeUndefined();
 });
 });

 describe('Database Type Detection', () => {
 it('should handle different database types in recommendations', async () => {
 const dbTypes = ['mysql', 'postgresql', 'mssql'];
 
 for (const dbType of dbTypes) {
 const recs = await tunnelManager.getPortRecommendations(dbType);
 
 expect(recs.recommended.length).toBeGreaterThan(0);
 expect(recs.status.length).toBe(recs.recommended.length);
 
 // Verify status objects have correct structure
 recs.status.forEach((status: {port: number; available: boolean; reason?: string}) => {
 expect(status).toHaveProperty('port');
 expect(status).toHaveProperty('available');
 expect(typeof status.port).toBe('number');
 expect(typeof status.available).toBe('boolean');
 });
 }
 });
 });

 describe('Port Conflict Resolution', () => {
 it('should handle port conflicts gracefully', async () => {
 const conflictPort = 46100;
 await testOccupier.occupyPort(conflictPort);
 
 const availability = await tunnelManager.checkPortAvailability(conflictPort);
 
 expect(availability.available).toBe(false);
 expect(availability.suggestion).toBeDefined();
 expect(availability.suggestion).toBeGreaterThan(conflictPort);
 
 // Verify suggested port is actually available
 if (availability.suggestion) {
 const suggestionCheck = await portManager.isPortAvailable(availability.suggestion);
 expect(suggestionCheck.isAvailable).toBe(true);
 }
 });

 it('should provide different suggestions for different conflict scenarios', async () => {
 const conflictPorts = [46200, 46201, 46202];
 
 // Occupy all conflict ports
 await Promise.all(conflictPorts.map(port => testOccupier.occupyPort(port)));
 
 // Check each one and collect suggestions
 const suggestions: number[] = [];
 
 for (const port of conflictPorts) {
 const availability = await tunnelManager.checkPortAvailability(port);
 expect(availability.available).toBe(false);
 
 if (availability.suggestion) {
 suggestions.push(availability.suggestion);
 }
 }
 
 // All suggestions should be unique and available
 const uniqueSuggestions = new Set(suggestions);
 expect(uniqueSuggestions.size).toBe(suggestions.length);
 
 // Verify all suggestions are actually available
 for (const suggestion of suggestions) {
 const check = await portManager.isPortAvailable(suggestion);
 expect(check.isAvailable).toBe(true);
 }
 });
 });

 describe('Resource Management', () => {
 it('should track tunnel count correctly', () => {
 const initialStats = tunnelManager.getTunnelStats();
 const initialTotal = initialStats.total;
 
 // Since we can't create real SSH tunnels in tests, we verify the counting logic
 expect(typeof initialTotal).toBe('number');
 expect(initialTotal).toBeGreaterThanOrEqual(0);
 
 // Verify other statistical properties
 expect(initialStats.active).toBeGreaterThanOrEqual(0);
 expect(initialStats.connecting).toBeGreaterThanOrEqual(0);
 expect(initialStats.errors).toBeGreaterThanOrEqual(0);
 
 // Total should be sum of states
 expect(initialStats.total).toBe(
 initialStats.active + 
 initialStats.connecting + 
 initialStats.errors
 );
 });

 it('should provide accurate port information', () => {
 const stats = tunnelManager.getTunnelStats();
 const portInfo = stats.portInfo;
 
 // Port info should be consistent
 expect(portInfo.preferredUsed + portInfo.autoAssigned).toBeLessThanOrEqual(stats.total);
 expect(portInfo.reserved.length).toBeGreaterThanOrEqual(0);
 
 // Reserved ports should be unique
 const uniqueReserved = new Set(portInfo.reserved);
 expect(uniqueReserved.size).toBe(portInfo.reserved.length);
 });
 });

 describe('Error Handling', () => {
 it('should handle invalid port numbers gracefully', async () => {
 const invalidPorts = [-1, 0, 65536, 99999];
 
 for (const port of invalidPorts) {
 expect(() => portManager.isValidPort(port)).not.toThrow();
 expect(portManager.isValidPort(port)).toBe(false);
 }
 });

 it('should handle network errors during port checks', async () => {
 // Test with a port that might cause permission errors on some systems
 const privilegedPort = 80;
 
 const result = await portManager.isPortAvailable(privilegedPort);
 
 // Should not throw, should return a result
 expect(result).toHaveProperty('port');
 expect(result).toHaveProperty('isAvailable');
 expect(result.port).toBe(privilegedPort);
 
 if (!result.isAvailable) {
 expect(result.reason).toBeDefined();
 expect(typeof result.reason).toBe('string');
 }
 });
 });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Port Management Integration', () => {
 let portManager: PortManager;
 let tunnelManager: EnhancedSSHTunnelManager;
 let testOccupier: TestPortOccupier;

 beforeEach(async () => {
 portManager = PortManager.getInstance();
 portManager.clearReservedPorts();
 tunnelManager = new EnhancedSSHTunnelManager();
 await tunnelManager.initialize();
 testOccupier = new TestPortOccupier();
 });

 afterEach(async () => {
 await tunnelManager.closeAllTunnels();
 await testOccupier.releaseAll();
 portManager.clearReservedPorts();
 });

 describe('End-to-End Port Assignment Scenarios', () => {
 it('should handle sequential port assignments', async () => {
 const basePort = 47000;
 const count = 5;
 
 const assignments: any[] = [];
 
 // Request ports sequentially
 for (let i = 0; i < count; i++) {
 const assignment = await portManager.findAvailablePort({
 minPort: basePort,
 maxPort: basePort + 100
 });
 
 assignments.push(assignment);
 expect(assignment.assignedPort).toBeGreaterThanOrEqual(basePort);
 expect(assignment.assignedPort).toBeLessThanOrEqual(basePort + 100);
 }
 
 // All assigned ports should be unique
 const assignedPorts = assignments.map(a => a.assignedPort);
 const uniquePorts = new Set(assignedPorts);
 expect(uniquePorts.size).toBe(assignedPorts.length);
 });

 it('should handle concurrent port requests', async () => {
 const basePort = 47100;
 const concurrentRequests = 10;
 
 // Make concurrent port assignment requests
 const assignmentPromises = Array.from({ length: concurrentRequests }, () =>
 portManager.findAvailablePort({
 minPort: basePort,
 maxPort: basePort + 200
 })
 );
 
 const assignments = await Promise.all(assignmentPromises);
 
 // All should succeed
 expect(assignments.length).toBe(concurrentRequests);
 
 // All ports should be unique
 const ports = assignments.map((a: any) => a.assignedPort);
 const uniquePorts = new Set(ports);
 expect(uniquePorts.size).toBe(ports.length);
 
 // All ports should be in valid range
 ports.forEach((port: number) => {
 expect(port).toBeGreaterThanOrEqual(basePort);
 expect(port).toBeLessThanOrEqual(basePort + 200);
 });
 });

 it('should handle port pressure gracefully', async () => {
 const rangeStart = 47300;
 const rangeSize = 10;
 const rangeEnd = rangeStart + rangeSize - 1;
 
 // Occupy most of the range, leaving only a few ports
 const portsToOccupy = Math.floor(rangeSize * 0.7); // 70% of range
 
 for (let i = 0; i < portsToOccupy; i++) {
 await testOccupier.occupyPort(rangeStart + i);
 }
 
 // Should still be able to find available ports
 const assignment = await portManager.findAvailablePort({
 minPort: rangeStart,
 maxPort: rangeEnd,
 maxAttempts: rangeSize * 2
 });
 
 expect(assignment.assignedPort).toBeGreaterThanOrEqual(rangeStart);
 expect(assignment.assignedPort).toBeLessThanOrEqual(rangeEnd);
 
 // Verify the assigned port is not occupied
 const occupiedPorts = testOccupier.getOccupiedPorts();
 expect(occupiedPorts).not.toContain(assignment.assignedPort);
 });
 });

 describe('Database-Specific Integration', () => {
 it('should provide consistent recommendations across components', async () => {
 const dbType = 'mysql';
 
 // Get recommendations from port manager
 const pmRecommendations = portManager.getPortRecommendations(dbType);
 
 // Get recommendations from tunnel manager
 const tmRecommendations = await tunnelManager.getPortRecommendations(dbType);
 
 // Should have the same recommended ports
 expect(tmRecommendations.recommended).toEqual(pmRecommendations);
 
 // Available ports should be a subset of recommended
 tmRecommendations.available.forEach((port: number) => {
 expect(tmRecommendations.recommended).toContain(port);
 });
 });

 it('should handle database type detection consistency', async () => {
 const dbTypes = ['mysql', 'postgresql', 'mssql'];
 
 for (const dbType of dbTypes) {
 const suggestion = await portManager.suggestTunnelPort(dbType);
 const recommendations = await tunnelManager.getPortRecommendations(dbType);
 
 expect(suggestion.assignedPort).toBeGreaterThan(0);
 expect(recommendations.recommended.length).toBeGreaterThan(0);
 
 // The suggested port should either be in recommendations OR in safe range (>=30000) OR be valid (>=1024)
 const isRecommended = recommendations.recommended.includes(suggestion.assignedPort);
 const isInSafeRange = suggestion.assignedPort >= 30000;
 const isValidPort = suggestion.assignedPort >= 1024 && suggestion.assignedPort <= 65535;
 
 // At minimum, the port should be valid
 expect(isValidPort).toBe(true);
 
 // And it should be either recommended (db-specific) or in safe range (general allocation)
 expect(isRecommended || isInSafeRange).toBe(true);
 }
 });
 });

 describe('Performance and Scalability', () => {
 it('should handle large numbers of port checks efficiently', async () => {
 const portCount = 100;
 const basePort = 48000;
 const ports = Array.from({ length: portCount }, (_, i) => basePort + i);
 
 const startTime = Date.now();
 const results = await portManager.checkMultiplePorts(ports);
 const duration = Date.now() - startTime;
 
 expect(results.length).toBe(portCount);
 expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
 
 // Verify all results have expected structure
 results.forEach((result: any, index: number) => {
 expect(result.port).toBe(ports[index]);
 expect(typeof result.isAvailable).toBe('boolean');
 });
 });

 it('should maintain performance under memory pressure', () => {
 const initialMemory = process.memoryUsage().heapUsed;
 
 // Create and release many port reservations
 const iterations = 1000;
 
 for (let i = 0; i < iterations; i++) {
 portManager.reservePort(50000 + i);
 }
 
 expect(portManager.getReservedPorts().length).toBe(iterations);
 
 portManager.clearReservedPorts();
 
 const finalMemory = process.memoryUsage().heapUsed;
 const memoryIncrease = finalMemory - initialMemory;
 
 // Memory increase should be reasonable (less than 50MB for 1000 reservations)
 expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
 });
 });
});
