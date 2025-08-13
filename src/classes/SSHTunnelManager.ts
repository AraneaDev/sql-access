/**
 * SSH Tunnel Manager for secure database connections
 */

import { Client as SSHClient } from 'ssh2';
import * as net from 'net';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import type {
  SSHTunnelInfo,
  SSHTunnelCreateOptions,
  SSHConnectionConfig,
  SSHForwardConfig,
  SSHTunnelStatus,
  SSHTunnelStatusInfo,
  ISSHTunnelManager,
  SSHConnectionEvent,
  SSHEventPayload,
  DatabaseConfig
} from '../types/index.js';
import { ConnectionError } from '../types/index.js';
import { validateSSHConfig } from '../types/index.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// SSH Tunnel Manager Implementation
// ============================================================================

export class SSHTunnelManager extends EventEmitter implements ISSHTunnelManager {
  private tunnels = new Map<string, SSHTunnelInfo>();
  private tunnelStatus = new Map<string, SSHTunnelStatusInfo>();
  private logger = getLogger();

  constructor() {
    super(); // Call EventEmitter constructor
    
    // Set up cleanup on process exit
    process.on('exit', () => {
      this.closeAllTunnels().catch(error => {
        this.logger.error('Error during cleanup on exit', error);
      });
    });

    process.on('SIGINT', () => {
      this.closeAllTunnels().then(() => {
        process.exit(0);
      }).catch(error => {
        this.logger.error('Error during SIGINT cleanup', error);
        process.exit(1);
      });
    });
  }

  /**
   * Initialize the SSH tunnel manager
   */
  async initialize(): Promise<void> {
    this.logger.info('SSH tunnel manager initialized');
  }

  /**
   * Check if a tunnel exists for the given database
   */
  hasTunnel(dbName: string): boolean {
    return this.tunnels.has(dbName);
  }

  // ============================================================================
  // Public Interface Methods
  // ============================================================================

  /**
   * Create a new SSH tunnel
   */
  async createTunnel(dbName: string, options: SSHTunnelCreateOptions): Promise<SSHTunnelInfo> {
    try {
      // Validate SSH configuration
      const validation = validateSSHConfig(options.sshConfig);
      if (!validation.isValid) {
        throw new ConnectionError(
          `Invalid SSH configuration for '${dbName}': ${validation.errors.join(', ')}`,
          { database: dbName, errors: validation.errors }
        );
      }

      if (validation.warnings.length > 0) {
        this.logger.warning(`SSH configuration warnings for '${dbName}'`, {
          warnings: validation.warnings
        });
      }

      this.logger.info(`Creating SSH tunnel for '${dbName}'`, {
        sshHost: options.sshConfig.host,
        sshPort: options.sshConfig.port,
        destinationHost: options.forwardConfig.destinationHost,
        destinationPort: options.forwardConfig.destinationPort
      });

      // Close existing tunnel if it exists
      if (this.tunnels.has(dbName)) {
        await this.closeTunnel(dbName);
      }

      // Update status to connecting
      this.updateTunnelStatus(dbName, {
        status: 'connecting',
        reconnectAttempts: 0,
        isHealthy: false
      });

      const tunnelInfo = await this.establishTunnel(dbName, options);
      
      // Update status to connected
      this.updateTunnelStatus(dbName, {
        status: 'connected',
        connectedAt: new Date(),
        reconnectAttempts: 0,
        isHealthy: true
      });

      this.logger.info(`SSH tunnel established for '${dbName}'`, {
        localHost: tunnelInfo.localHost,
        localPort: tunnelInfo.localPort,
        remoteHost: tunnelInfo.remoteHost,
        remotePort: tunnelInfo.remotePort
      });

      return tunnelInfo;

    } catch (error) {
      this.updateTunnelStatus(dbName, {
        status: 'error',
        lastError: (error as Error).message,
        reconnectAttempts: 0,
        isHealthy: false
      });

      if (error instanceof ConnectionError) {
        throw error;
      }

      throw new ConnectionError(
        `Failed to create SSH tunnel for '${dbName}': ${(error as Error).message}`,
        { database: dbName, originalError: (error as Error).message }
      );
    }
  }

  /**
   * Get existing tunnel information
   */
  getTunnel(dbName: string): SSHTunnelInfo | undefined {
    return this.tunnels.get(dbName);
  }

  /**
   * Close a specific SSH tunnel
   */
  async closeTunnel(dbName: string): Promise<void> {
    const tunnel = this.tunnels.get(dbName);
    
    if (!tunnel) {
      return; // Tunnel doesn't exist, nothing to close
    }

    this.logger.info(`Closing SSH tunnel for '${dbName}'`);

    try {
      // Close the local server
      if (tunnel.server) {
        await new Promise<void>((resolve, reject) => {
          tunnel.server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      // Close the SSH connection
      if (tunnel.connection) {
        tunnel.connection.end();
      }

      // Update tunnel status
      this.updateTunnelStatus(dbName, {
        status: 'disconnected',
        reconnectAttempts: 0,
        isHealthy: false
      });

      this.logger.info(`SSH tunnel closed for '${dbName}'`);

    } catch (error) {
      this.logger.error(`Error closing SSH tunnel for '${dbName}'`, error as Error);
    } finally {
      // Always remove from maps
      this.tunnels.delete(dbName);
      this.tunnelStatus.delete(dbName);
    }
  }

  /**
   * Close all SSH tunnels
   */
  async closeAllTunnels(): Promise<void> {
    const dbNames = Array.from(this.tunnels.keys());
    
    if (dbNames.length === 0) {
      return;
    }

    this.logger.info(`Closing ${dbNames.length} SSH tunnels`);

    await Promise.all(
      dbNames.map(async (dbName) => {
        try {
          await this.closeTunnel(dbName);
        } catch (error) {
          this.logger.error(`Error closing SSH tunnel for '${dbName}'`, error as Error);
        }
      })
    );

    this.logger.info('All SSH tunnels closed');
  }

  /**
   * Check if a tunnel is connected
   */
  isConnected(dbName: string): boolean {
    const tunnel = this.tunnels.get(dbName);
    const status = this.tunnelStatus.get(dbName);
    
    return !!(tunnel && tunnel.isActive && status && status.isHealthy);
  }

  // ============================================================================
  // Status and Information Methods
  // ============================================================================

  /**
   * Get tunnel status information
   */
  getTunnelStatus(dbName: string): SSHTunnelStatusInfo | undefined {
    return this.tunnelStatus.get(dbName);
  }

  /**
   * Get all active tunnels
   */
  getActiveTunnels(): string[] {
    return Array.from(this.tunnels.keys()).filter(dbName => this.isConnected(dbName));
  }

  /**
   * Get tunnel statistics
   */
  getTunnelStats(): {
    total: number;
    active: number;
    connecting: number;
    errors: number;
  } {
    const statuses = Array.from(this.tunnelStatus.values());
    
    return {
      total: statuses.length,
      active: statuses.filter(s => s.status === 'connected' && s.isHealthy).length,
      connecting: statuses.filter(s => s.status === 'connecting').length,
      errors: statuses.filter(s => s.status === 'error').length
    };
  }

  // ============================================================================
  // Private Implementation Methods
  // ============================================================================

  private async establishTunnel(dbName: string, options: SSHTunnelCreateOptions): Promise<SSHTunnelInfo> {
    return new Promise<SSHTunnelInfo>((resolve, reject) => {
      const sshClient = new SSHClient();
      let server: net.Server;
      let assignedPort: number;

      // Set up SSH client event handlers
      sshClient.on('ready', () => {
        this.logger.debug(`SSH connection established for '${dbName}'`);
        
        // Create server to listen for local connections
        server = net.createServer((clientSocket) => {
          this.logger.debug(`Local connection received for tunnel '${dbName}', creating forward`);
          
          sshClient.forwardOut(
            options.forwardConfig.sourceHost,
            options.forwardConfig.sourcePort,
            options.forwardConfig.destinationHost,
            options.forwardConfig.destinationPort,
            (err, sshStream) => {
              if (err) {
                this.logger.error(`SSH forward error for '${dbName}'`, err);
                clientSocket.end();
                return;
              }
              
              // Pipe data between client and SSH stream
              clientSocket.pipe(sshStream);
              sshStream.pipe(clientSocket);
              
              // Handle stream events
              sshStream.on('close', () => {
                clientSocket.end();
              });
              
              sshStream.on('error', (streamError: Error) => {
                this.logger.error(`SSH stream error for '${dbName}'`, streamError);
                clientSocket.end();
              });
              
              clientSocket.on('close', () => {
                sshStream.close();
              });

              clientSocket.on('error', (clientError) => {
                this.logger.error(`Client socket error for '${dbName}'`, clientError);
                sshStream.close();
              });
            }
          );
        });

        // Listen on specified or random port
        const localPort = options.localPort || 0;
        server.listen(localPort, '127.0.0.1', () => {
          const address = server.address();
          assignedPort = typeof address === 'object' && address ? address.port : localPort;
          
          this.logger.debug(`SSH tunnel server listening on port ${assignedPort} for '${dbName}'`);
          
          const tunnelInfo: SSHTunnelInfo = {
            server,
            connection: sshClient,
            localPort: assignedPort,
            localHost: '127.0.0.1',
            remoteHost: options.forwardConfig.destinationHost,
            remotePort: options.forwardConfig.destinationPort,
            isActive: true
          };

          // Store tunnel info
          this.tunnels.set(dbName, tunnelInfo);
          
          // Set up tunnel monitoring
          this.setupTunnelMonitoring(dbName, tunnelInfo);
          
          resolve(tunnelInfo);
        });

        server.on('error', (serverError) => {
          this.logger.error(`SSH tunnel server error for '${dbName}'`, serverError);
          reject(new Error(`SSH tunnel server failed: ${serverError.message}`));
        });
      });

      sshClient.on('error', (sshError) => {
        this.logger.error(`SSH client error for '${dbName}'`, sshError);
        reject(new Error(`SSH connection failed: ${sshError.message}`));
      });

      sshClient.on('end', () => {
        this.logger.warning(`SSH connection ended for '${dbName}'`);
        this.markTunnelInactive(dbName);
      });

      (sshClient as any).on('close', (hadError: boolean) => {
        this.logger.info(`SSH connection closed for '${dbName}'`, { hadError });
        this.markTunnelInactive(dbName);
      });

      // Connect to SSH server
      const connectOptions = this.buildSSHConnectOptions(options.sshConfig);
      
      this.logger.debug(`Connecting to SSH server for '${dbName}'`, {
        host: connectOptions.host,
        port: connectOptions.port,
        username: connectOptions.username,
        authMethod: connectOptions.password ? 'password' : 'key'
      });

      sshClient.connect(connectOptions);
    });
  }

  private buildSSHConnectOptions(config: SSHConnectionConfig): any {
    const connectOptions: any = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 30000,
      keepaliveInterval: 60000
    };

    if (config.password) {
      connectOptions.password = config.password;
    } else if (config.privateKey) {
      try {
        if (typeof config.privateKey === 'string') {
          // Check if it's a file path or the key content
          if (config.privateKey.includes('-----BEGIN') || !fs.existsSync(config.privateKey)) {
            // It's the key content
            connectOptions.privateKey = config.privateKey;
          } else {
            // It's a file path
            connectOptions.privateKey = fs.readFileSync(config.privateKey);
          }
        } else {
          connectOptions.privateKey = config.privateKey;
        }
        
        if (config.passphrase) {
          connectOptions.passphrase = config.passphrase;
        }
      } catch (error) {
        throw new Error(`Failed to read SSH private key: ${(error as Error).message}`);
      }
    }

    return connectOptions;
  }

  private setupTunnelMonitoring(dbName: string, tunnel: SSHTunnelInfo): void {
    // Set up connection monitoring
    tunnel.connection.on('error', (error) => {
      this.handleTunnelEvent(dbName, {
        event: 'error',
        tunnel,
        error,
        message: `SSH connection error: ${error.message}`
      });
    });

    tunnel.connection.on('end', () => {
      this.handleTunnelEvent(dbName, {
        event: 'end',
        tunnel,
        message: 'SSH connection ended'
      });
    });

    (tunnel.connection as any).on('close', (hadError: boolean) => {
      this.handleTunnelEvent(dbName, {
        event: 'close',
        tunnel,
        message: 'SSH connection closed'
      });
    });

    // Monitor server events
    tunnel.server.on('error', (error) => {
      this.logger.error(`SSH tunnel server error for '${dbName}'`, error);
      this.updateTunnelStatus(dbName, {
        status: 'error',
        lastError: error.message,
        isHealthy: false
      });
    });

    tunnel.server.on('close', () => {
      this.logger.info(`SSH tunnel server closed for '${dbName}'`);
      this.markTunnelInactive(dbName);
    });
  }

  private handleTunnelEvent(dbName: string, event: SSHEventPayload): void {
    this.logger.info(`SSH tunnel event for '${dbName}': ${event.event}`, {
      message: event.message,
      error: event.error?.message
    });

    switch (event.event) {
      case 'error':
        this.updateTunnelStatus(dbName, {
          status: 'error',
          lastError: event.error?.message || 'Unknown error',
          isHealthy: false
        });
        break;

      case 'end':
      case 'close':
        this.markTunnelInactive(dbName);
        break;
    }
  }

  private markTunnelInactive(dbName: string): void {
    const tunnel = this.tunnels.get(dbName);
    if (tunnel) {
      tunnel.isActive = false;
      this.updateTunnelStatus(dbName, {
        status: 'disconnected',
        isHealthy: false
      });
    }
  }

  private updateTunnelStatus(dbName: string, updates: Partial<SSHTunnelStatusInfo>): void {
    const current = this.tunnelStatus.get(dbName) || {
      status: 'disconnected' as SSHTunnelStatus,
      reconnectAttempts: 0,
      isHealthy: false
    };

    const updated = { ...current, ...updates };
    this.tunnelStatus.set(dbName, updated);
  }
}
