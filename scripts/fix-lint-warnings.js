#!/usr/bin/env node

/**
 * Script to automatically fix lint warnings
 */

const fs = require('fs');
const path = require('path');

// Files and their specific fixes
const fixes = [
  {
    file: 'src/types/config.ts',
    replacements: [
      {
        search: /import type { DatabaseType, SecurityConfig, ExtensionConfig, DatabaseTypeString } from '\.\/database\.js';/g,
        replace: 'import type { SecurityConfig, ExtensionConfig, DatabaseTypeString } from \'./database.js\';'
      },
      {
        search: /getDefaultConfig\(configPath\?: string, rawConfig\?: RawConfigFile\): ParsedServerConfig {/g,
        replace: 'getDefaultConfig(_configPath?: string, _rawConfig?: RawConfigFile): ParsedServerConfig {'
      },
      {
        search: /parseDatabaseConfig\(raw: DatabaseSectionConfig, dbName: string\): ParsedDatabaseConfig;/g,
        replace: 'parseDatabaseConfig(raw: DatabaseSectionConfig, _dbName: string): ParsedDatabaseConfig;'
      }
    ]
  },
  {
    file: 'src/types/mcp.ts',
    replacements: [
      {
        search: /isMCPRequest\(message: MCPMessage\): message is MCPRequest {/g,
        replace: 'isMCPRequest(_message: MCPMessage): _message is MCPRequest {'
      }
    ]
  },
  {
    file: 'src/types/ssh.ts',
    replacements: [
      {
        search: /createTunnel\(dbName: string, options: SSHTunnelCreateOptions\): Promise<SSHTunnelInfo>;/g,
        replace: 'createTunnel(_dbName: string, _options: SSHTunnelCreateOptions): Promise<SSHTunnelInfo>;'
      },
      {
        search: /getTunnel\(dbName: string\): SSHTunnelInfo \| undefined;/g,
        replace: 'getTunnel(_dbName: string): SSHTunnelInfo | undefined;'
      },
      {
        search: /closeTunnel\(dbName: string\): Promise<void>;/g,
        replace: 'closeTunnel(_dbName: string): Promise<void>;'
      },
      {
        search: /isConnected\(dbName: string\): boolean;/g,
        replace: 'isConnected(_dbName: string): boolean;'
      }
    ]
  },
  {
    file: 'src/utils/config.ts',
    replacements: [
      {
        search: /import type {\s*SecurityConfig,\s*ExtensionConfig,\s*DatabaseConfig,\s*}/g,
        replace: 'import type {}'
      },
      {
        search: /parseField\(field: string, database: string\): ParsedField {/g,
        replace: 'parseField(_field: string, _database: string): ParsedField {'
      }
    ]
  },
  {
    file: 'src/utils/error-handler.ts',
    replacements: [
      {
        search: /constructor\(message: string, code: string, details\?: Record<string, unknown>\) {/g,
        replace: 'constructor(message: string, _code: string, _details?: Record<string, unknown>) {'
      },
      {
        search: /formatError\(\.\.\.\s*args:\s*unknown\[\]\):\s*string\s*{/g,
        replace: 'formatError(..._args: unknown[]): string {'
      }
    ]
  },
  {
    file: 'src/utils/logger.ts',
    replacements: [
      {
        search: /log\(level: string, message: string, \.\.\.args: unknown\[\]\): void {/g,
        replace: 'log(level: string, message: string, ..._args: unknown[]): void {'
      }
    ]
  }
];

// Apply fixes
fixes.forEach(({ file, replacements }) => {
  const filePath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${file}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  replacements.forEach(({ search, replace }) => {
    const newContent = content.replace(search, replace);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  });
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed warnings in: ${file}`);
  } else {
    console.log(`ℹ️  No changes needed in: ${file}`);
  }
});

console.log('🎉 Lint warning fixes complete!');
