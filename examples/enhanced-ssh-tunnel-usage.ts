/**
 * Example integration of Enhanced SSH Tunnel Manager
 * This demonstrates how to use the smart port management features
 */

import { EnhancedSSHTunnelManager } from '../src/classes/EnhancedSSHTunnelManager.js';
import { PortManager } from '../src/utils/port-manager.js';
import type { 
 SSHTunnelCreateOptions, 
 DatabaseConfig 
} from '../src/types/index.js';

// ============================================================================
// Basic Usage Example
// ============================================================================

async function basicSSHTunnelExample() {
 const tunnelManager = new EnhancedSSHTunnelManager();
 await tunnelManager.initialize();

 try {
 // Create a tunnel with automatic port assignment
 const tunnelResult = await tunnelManager.createEnhancedTunnel('mysql-prod', {
 sshConfig: {
 host: 'bastion.company.com',
 port: 22,
 username: 'deploy',
 privateKey: '/path/to/private/key'
 },
 forwardConfig: {
 sourceHost: '127.0.0.1',
 sourcePort: 0, // Auto-assign
 destinationHost: 'mysql.internal.company.com',
 destinationPort: 3306
 }
 // localPort not specified - will auto-assign intelligently
 });

 console.log(' SSH Tunnel Created Successfully!');
 console.log(` Local connection: ${tunnelResult.tunnel.localHost}:${tunnelResult.tunnel.localPort}`);
 console.log(` Remote target: ${tunnelResult.tunnel.remoteHost}:${tunnelResult.tunnel.remotePort}`);
 console.log(` Port assignment:`, {
 requested: tunnelResult.portInfo.requested,
 assigned: tunnelResult.portInfo.assigned,
 wasPreferred: tunnelResult.portInfo.wasPreferred,
 reason: tunnelResult.portInfo.reason
 });

 // Now you can connect to the database using the local port
 const connectionString = `mysql://user:password@${tunnelResult.tunnel.localHost}:${tunnelResult.tunnel.localPort}/database`;
 console.log(` Connection string: ${connectionString}`);

 // Keep tunnel running for demonstration
 await new Promise(resolve => setTimeout(resolve, 5000));

 } catch (error) {
 console.error(' Failed to create SSH tunnel:', error);
 } finally {
 // Always clean up
 await tunnelManager.closeAllTunnels();
 console.log(' SSH tunnels closed');
 }
}

// ============================================================================
// Advanced Usage with Preferred Ports
// ============================================================================

async function advancedSSHTunnelExample() {
 const tunnelManager = new EnhancedSSHTunnelManager();
 const portManager = PortManager.getInstance();
 
 await tunnelManager.initialize();

 try {
 // First, check what ports are recommended for MySQL
 const mysqlRecommendations = await tunnelManager.getPortRecommendations('mysql');
 console.log(' MySQL port recommendations:', mysqlRecommendations);

 // Check if a specific port is available
 const preferredPort = 3307;
 const portAvailability = await tunnelManager.checkPortAvailability(preferredPort);
 
 if (portAvailability.available) {
 console.log(` Preferred port ${preferredPort} is available`);
 } else {
 console.log(` Preferred port ${preferredPort} is not available: ${portAvailability.reason}`);
 if (portAvailability.suggestion) {
 console.log(` Suggested alternative: ${portAvailability.suggestion}`);
 }
 }

 // Create tunnel with preferred port
 const tunnelResult = await tunnelManager.createEnhancedTunnel('mysql-staging', {
 sshConfig: {
 host: 'staging-bastion.company.com',
 port: 22,
 username: 'deploy',
 password: 'ssh-password' // In real usage, use key-based auth
 },
 forwardConfig: {
 sourceHost: '127.0.0.1',
 sourcePort: 0,
 destinationHost: 'mysql-staging.internal',
 destinationPort: 3306
 },
 localPort: preferredPort // Request specific port
 });

 console.log(' Advanced tunnel created:');
 console.log(` Requested port: ${preferredPort}`);
 console.log(` Assigned port: ${tunnelResult.portInfo.assigned}`);
 console.log(` Used preferred: ${tunnelResult.portInfo.wasPreferred}`);
 console.log(` Reason: ${tunnelResult.portInfo.reason}`);

 // Get tunnel statistics
 const stats = tunnelManager.getTunnelStats();
 console.log(' Tunnel statistics:', {
 total: stats.total,
 active: stats.active,
 portInfo: {
 reserved: stats.portInfo.reserved.length,
 preferredUsed: stats.portInfo.preferredUsed,
 autoAssigned: stats.portInfo.autoAssigned
 }
 });

 } catch (error) {
 console.error(' Advanced tunnel creation failed:', error);
 } finally {
 await tunnelManager.closeAllTunnels();
 }
}

// ============================================================================
// Multiple Database Tunnels Example
// ============================================================================

async function multiDatabaseTunnelExample() {
 const tunnelManager = new EnhancedSSHTunnelManager();
 await tunnelManager.initialize();

 const databases: Array<{name: string; config: SSHTunnelCreateOptions; dbType: string}> = [
 {
 name: 'mysql-prod',
 dbType: 'mysql',
 config: {
 sshConfig: {
 host: 'prod-bastion.company.com',
 port: 22,
 username: 'deploy',
 privateKey: '/keys/prod-key'
 },
 forwardConfig: {
 sourceHost: '127.0.0.1',
 sourcePort: 0,
 destinationHost: 'mysql-prod.internal',
 destinationPort: 3306
 }
 }
 },
 {
 name: 'postgres-prod',
 dbType: 'postgresql',
 config: {
 sshConfig: {
 host: 'prod-bastion.company.com',
 port: 22,
 username: 'deploy',
 privateKey: '/keys/prod-key'
 },
 forwardConfig: {
 sourceHost: '127.0.0.1',
 sourcePort: 0,
 destinationHost: 'postgres-prod.internal',
 destinationPort: 5432
 }
 }
 },
 {
 name: 'mssql-analytics',
 dbType: 'mssql',
 config: {
 sshConfig: {
 host: 'analytics-bastion.company.com',
 port: 22,
 username: 'analytics-user',
 privateKey: '/keys/analytics-key'
 },
 forwardConfig: {
 sourceHost: '127.0.0.1',
 sourcePort: 0,
 destinationHost: 'mssql-analytics.internal',
 destinationPort: 1433
 }
 }
 }
 ];

 try {
 console.log(' Creating multiple database tunnels...');
 
 // Create all tunnels concurrently
 const tunnelPromises = databases.map(async (db) => {
 console.log(` Creating tunnel for ${db.name} (${db.dbType})...`);
 const result = await tunnelManager.createEnhancedTunnel(db.name, db.config);
 return { name: db.name, dbType: db.dbType, result };
 });

 const tunnelResults = await Promise.all(tunnelPromises);

 console.log('\n All tunnels created successfully!');
 console.log(' Connection details:');
 
 tunnelResults.forEach(({ name, dbType, result }) => {
 console.log(`\n ${name} (${dbType}):`);
 console.log(` Local: ${result.tunnel.localHost}:${result.tunnel.localPort}`);
 console.log(` Remote: ${result.tunnel.remoteHost}:${result.tunnel.remotePort}`);
 console.log(` Port assignment: ${result.portInfo.wasPreferred ? 'Preferred' : 'Auto-assigned'}`);
 
 // Generate connection strings for different database types
 let connectionString = '';
 switch (dbType) {
 case 'mysql':
 connectionString = `mysql://user:password@localhost:${result.tunnel.localPort}/database`;
 break;
 case 'postgresql':
 connectionString = `postgresql://user:password@localhost:${result.tunnel.localPort}/database`;
 break;
 case 'mssql':
 connectionString = `mssql://user:password@localhost:${result.tunnel.localPort}/database`;
 break;
 }
 console.log(` Connection: ${connectionString}`);
 });

 // Show overall statistics
 const finalStats = tunnelManager.getTunnelStats();
 console.log('\n Final tunnel statistics:');
 console.log(` Total tunnels: ${finalStats.total}`);
 console.log(` Active tunnels: ${finalStats.active}`);
 console.log(` Preferred ports used: ${finalStats.portInfo.preferredUsed}`);
 console.log(` Auto-assigned ports: ${finalStats.portInfo.autoAssigned}`);
 console.log(` Reserved ports: [${finalStats.portInfo.reserved.join(', ')}]`);

 // Keep tunnels running for demo
 console.log('\n[TIME] Keeping tunnels active for 10 seconds...');
 await new Promise(resolve => setTimeout(resolve, 10000));

 } catch (error) {
 console.error(' Multi-database tunnel setup failed:', error);
 } finally {
 console.log('\n Cleaning up all tunnels...');
 await tunnelManager.closeAllTunnels();
 console.log(' All tunnels closed successfully');
 }
}

// ============================================================================
// Port Conflict Resolution Example
// ============================================================================

async function portConflictResolutionExample() {
 const portManager = PortManager.getInstance();
 
 console.log(' Demonstrating port conflict resolution...');

 // Simulate a scenario where common ports might be occupied
 const potentiallyConflictingPorts = [3306, 3307, 3308, 5432, 5433, 1433, 1434];
 
 console.log('\n Checking port availability:');
 const portChecks = await portManager.checkMultiplePorts(potentiallyConflictingPorts);
 
 portChecks.forEach(check => {
 const status = check.isAvailable ? '' : '';
 const reason = check.reason ? ` (${check.reason})` : '';
 console.log(` ${status} Port ${check.port}${reason}`);
 });

 // Demonstrate smart assignment for different database types
 console.log('\n Smart port assignment for different database types:');
 
 const databaseTypes = ['mysql', 'postgresql', 'mssql'];
 
 for (const dbType of databaseTypes) {
 try {
 const suggestion = await portManager.suggestTunnelPort(dbType);
 console.log(` ${dbType.toUpperCase()}: Port ${suggestion.assignedPort} (${suggestion.reason || 'auto-assigned'})`);
 } catch (error) {
 console.log(` ${dbType.toUpperCase()}: Failed to assign port - ${error}`);
 }
 }

 // Show recommendations for each database type
 console.log('\n Port recommendations by database type:');
 databaseTypes.forEach(dbType => {
 const recommendations = portManager.getPortRecommendations(dbType);
 console.log(` ${dbType.toUpperCase()}: [${recommendations.join(', ')}]`);
 });
}

// ============================================================================
// Error Handling Example
// ============================================================================

async function errorHandlingExample() {
 const tunnelManager = new EnhancedSSHTunnelManager();
 await tunnelManager.initialize();

 console.log(' Demonstrating error handling scenarios...');

 // Scenario 1: Invalid SSH configuration
 try {
 await tunnelManager.createEnhancedTunnel('invalid-config', {
 sshConfig: {
 host: '', // Invalid empty host
 port: 22,
 username: 'test',
 password: 'test'
 },
 forwardConfig: {
 sourceHost: '127.0.0.1',
 sourcePort: 0,
 destinationHost: 'remote-db',
 destinationPort: 3306
 }
 });
 } catch (error) {
 console.log(' Caught invalid SSH config error:', (error as Error).message);
 }

 // Scenario 2: Port range exhaustion (simulated)
 const portManager = PortManager.getInstance();
 
 try {
 // Try to find port in a very narrow range (likely to fail)
 await portManager.findAvailablePort({
 minPort: 1,
 maxPort: 10, // Very limited range
 maxAttempts: 5
 });
 } catch (error) {
 console.log(' Caught port exhaustion error:', (error as Error).message);
 }

 // Scenario 3: Graceful handling of unavailable preferred port
 try {
 // Check a port that's likely to be unavailable (port 80 - HTTP)
 const availability = await tunnelManager.checkPortAvailability(80);
 
 if (!availability.available) {
 console.log(` Port 80 unavailable as expected: ${availability.reason}`);
 if (availability.suggestion) {
 console.log(` System suggested alternative port: ${availability.suggestion}`);
 }
 }
 } catch (error) {
 console.log(' Error checking port 80:', (error as Error).message);
 }

 await tunnelManager.closeAllTunnels();
}

// ============================================================================
// Main Execution
// ============================================================================

async function runExamples() {
 console.log(' Enhanced SSH Tunnel Management Examples\n');

 try {
 console.log('1 Basic SSH Tunnel Example');
 console.log('=' .repeat(50));
 await basicSSHTunnelExample();

 console.log('\n\n2 Advanced Usage Example');
 console.log('=' .repeat(50));
 await advancedSSHTunnelExample();

 console.log('\n\n3 Multiple Database Tunnels');
 console.log('=' .repeat(50));
 await multiDatabaseTunnelExample();

 console.log('\n\n4 Port Conflict Resolution');
 console.log('=' .repeat(50));
 await portConflictResolutionExample();

 console.log('\n\n5 Error Handling Examples');
 console.log('=' .repeat(50));
 await errorHandlingExample();

 } catch (error) {
 console.error(' Example execution failed:', error);
 }

 console.log('\n All examples completed!');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
 runExamples().catch(console.error);
}

// Export functions for use in other modules
export {
 basicSSHTunnelExample,
 advancedSSHTunnelExample,
 multiDatabaseTunnelExample,
 portConflictResolutionExample,
 errorHandlingExample
};
