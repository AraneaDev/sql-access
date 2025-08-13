#!/usr/bin/env node

/**
 * Production Build Script
 * 
 * This script handles the complete build process for the Claude SQL MCP Server,
 * including validation, testing, compilation, and optimization.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BuildOptions {
  skipTests?: boolean;
  skipLint?: boolean;
  verbose?: boolean;
  production?: boolean;
}

class BuildScript {
  private options: BuildOptions;
  private startTime: number;

  constructor(options: BuildOptions = {}) {
    this.options = options;
    this.startTime = Date.now();
  }

  log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }

  error(message: string): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`);
  }

  success(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`);
  }

  async exec(command: string, description: string): Promise<void> {
    this.log(`${description}...`);
    
    try {
      const output = execSync(command, { 
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        encoding: 'utf8'
      });
      
      if (this.options.verbose && output) {
        console.log(output);
      }
      
      this.success(`${description} completed`);
    } catch (error) {
      this.error(`${description} failed`);
      if (error instanceof Error) {
        console.error(error.message);
        if ('stdout' in error) {
          console.error('stdout:', error.stdout);
        }
        if ('stderr' in error) {
          console.error('stderr:', error.stderr);
        }
      }
      process.exit(1);
    }
  }

  checkPrerequisites(): void {
    this.log('Checking prerequisites...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 16) {
      this.error(`Node.js 16+ required, found ${nodeVersion}`);
      process.exit(1);
    }
    
    // Check if package.json exists
    if (!fs.existsSync('package.json')) {
      this.error('package.json not found');
      process.exit(1);
    }
    
    // Check if src directory exists
    if (!fs.existsSync('src')) {
      this.error('src directory not found');
      process.exit(1);
    }
    
    this.success('Prerequisites check passed');
  }

  async clean(): Promise<void> {
    await this.exec('npm run clean', 'Cleaning build directory');
  }

  async typeCheck(): Promise<void> {
    await this.exec('npm run type-check', 'Type checking');
  }

  async lint(): Promise<void> {
    if (this.options.skipLint) {
      this.log('Skipping linting (--skip-lint)');
      return;
    }
    
    await this.exec('npm run lint:check', 'Linting code');
  }

  async test(): Promise<void> {
    if (this.options.skipTests) {
      this.log('Skipping tests (--skip-tests)');
      return;
    }
    
    const testCommand = this.options.production 
      ? 'npm run test:coverage'
      : 'npm test';
    
    await this.exec(testCommand, 'Running tests');
  }

  async compile(): Promise<void> {
    const buildCommand = this.options.production
      ? 'npm run build'
      : 'npm run build:fast';
      
    await this.exec(buildCommand, 'Compiling TypeScript');
  }

  validateOutput(): void {
    this.log('Validating build output...');
    
    const distDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      this.error('dist directory not created');
      process.exit(1);
    }
    
    const requiredFiles = ['index.js', 'setup.js'];
    for (const file of requiredFiles) {
      const filePath = path.join(distDir, file);
      if (!fs.existsSync(filePath)) {
        this.error(`Required file not found: ${file}`);
        process.exit(1);
      }
    }
    
    // Check file sizes
    const indexStats = fs.statSync(path.join(distDir, 'index.js'));
    const setupStats = fs.statSync(path.join(distDir, 'setup.js'));
    
    this.log(`Build output:`);
    this.log(`  index.js: ${Math.round(indexStats.size / 1024)}KB`);
    this.log(`  setup.js: ${Math.round(setupStats.size / 1024)}KB`);
    
    this.success('Build output validation passed');
  }

  generateBuildInfo(): void {
    const buildInfo = {
      version: process.env.npm_package_version || '2.0.0',
      buildTime: new Date().toISOString(),
      nodeVersion: process.version,
      buildDuration: Date.now() - this.startTime,
      production: this.options.production,
      commit: this.getGitCommit()
    };
    
    const buildInfoPath = path.join('dist', 'build-info.json');
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
    
    this.success(`Build info saved to ${buildInfoPath}`);
  }

  private getGitCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  async run(): Promise<void> {
    this.log('🚀 Starting Claude SQL MCP Server build process');
    this.log(`Options: ${JSON.stringify(this.options)}`);
    
    try {
      this.checkPrerequisites();
      await this.clean();
      await this.typeCheck();
      await this.lint();
      await this.test();
      await this.compile();
      this.validateOutput();
      this.generateBuildInfo();
      
      const duration = Date.now() - this.startTime;
      this.success(`Build completed successfully in ${Math.round(duration / 1000)}s`);
      
      this.log('\n📦 Next steps:');
      this.log('  • Test the build: npm start');
      this.log('  • Run setup: npm run setup');
      this.log('  • Deploy to production');
      
    } catch (error) {
      this.error('Build failed');
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }
  }
}

// Parse command line arguments
function parseArgs(): BuildOptions {
  const args = process.argv.slice(2);
  const options: BuildOptions = {};
  
  for (const arg of args) {
    switch (arg) {
      case '--skip-tests':
        options.skipTests = true;
        break;
      case '--skip-lint':
        options.skipLint = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--production':
        options.production = true;
        break;
      case '--help':
        console.log(`
Production Build Script for Claude SQL MCP Server

Usage: node scripts/build.js [options]

Options:
  --skip-tests      Skip running tests
  --skip-lint       Skip linting
  --verbose         Enable verbose output
  --production      Enable production optimizations
  --help            Show this help message

Examples:
  node scripts/build.js                    # Full build
  node scripts/build.js --skip-tests       # Skip tests
  node scripts/build.js --production       # Production build
        `);
        process.exit(0);
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  
  return options;
}

// Run the build script
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  const build = new BuildScript(options);
  build.run().catch((error) => {
    console.error('Build script failed:', error);
    process.exit(1);
  });
}

export { BuildScript };
