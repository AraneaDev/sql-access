#!/usr/bin/env node

/**
 * Documentation Validation Script
 * 
 * This script validates that documented features have corresponding implementations
 * and checks for version consistency across files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.dirname(__dirname);

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

/**
 * Main validation function
 */
async function validateDocumentation() {
  console.log(`${colors.blue}🔍 Documentation Validation Starting...${colors.reset}\n`);

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test 1: Version Consistency
  console.log('📋 Checking version consistency...');
  await checkVersionConsistency(results);

  // Test 2: Setup Script Features
  console.log('\n📋 Validating setup script features...');
  await validateSetupFeatures(results);

  // Test 3: MCP Tools Documentation
  console.log('\n📋 Validating MCP tools documentation...');
  await validateMCPTools(results);

  // Test 4: Configuration Examples
  console.log('\n📋 Validating configuration examples...');
  await validateConfigurationExamples(results);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.blue}📊 Validation Summary:${colors.reset}`);
  console.log(`  ✅ Passed: ${colors.green}${results.passed}${colors.reset}`);
  console.log(`  ❌ Failed: ${colors.red}${results.failed}${colors.reset}`);
  console.log(`  ⚠️  Warnings: ${colors.yellow}${results.warnings}${colors.reset}`);
  
  if (results.failed === 0) {
    console.log(`\n${colors.green}🎉 All validation checks passed!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}❌ ${results.failed} validation check(s) failed.${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Check version consistency across files
 */
async function checkVersionConsistency(results) {
  try {
    // Read package.json version
    const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    const expectedVersion = packageJson.version;
    
    console.log(`  📦 Package version: ${expectedVersion}`);

    // Check files that should contain version references
    const filesToCheck = [
      { file: 'src/types/index.ts', pattern: /SERVER_VERSION = '([^']+)'/g, name: 'SERVER_VERSION' },
      { file: 'README.md', pattern: /MCP SQL Access Server v([0-9.]+)/g, name: 'README title' },
      { file: 'docs/api/typescript-api.md', pattern: /as of v([0-9]+\.[0-9]+\.[0-9]+)\.?\s/g, name: 'TypeScript API docs' },
      { file: 'docs/tutorials/01-installation.md', pattern: /SQL MCP Server v([0-9.]+)/g, name: 'Installation tutorial' }
    ];

    for (const { file, pattern, name } of filesToCheck) {
      const filePath = path.join(PROJECT_ROOT, file);
      
      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  File not found: ${file}`);
        results.warnings++;
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const matches = [...content.matchAll(pattern)];
      
      if (matches.length === 0) {
        console.log(`  ❌ No version found in ${name}`);
        results.failed++;
      } else {
        const foundVersion = matches[0][1];
        if (foundVersion === expectedVersion) {
          console.log(`  ✅ ${name}: ${foundVersion}`);
          results.passed++;
        } else {
          console.log(`  ❌ ${name}: Expected ${expectedVersion}, found ${foundVersion}`);
          results.failed++;
        }
      }
    }
  } catch (error) {
    console.log(`  ❌ Error checking version consistency: ${error.message}`);
    results.failed++;
  }
}

/**
 * Validate setup script features
 */
async function validateSetupFeatures(results) {
  try {
    // Check if setup script exists and is buildable
    const setupPath = path.join(PROJECT_ROOT, 'src/setup.ts');
    const distSetupPath = path.join(PROJECT_ROOT, 'dist/setup.js');
    
    if (!fs.existsSync(setupPath)) {
      console.log('  ❌ Setup script source not found');
      results.failed++;
      return;
    }
    
    if (!fs.existsSync(distSetupPath)) {
      console.log('  ❌ Setup script not built (run npm run build)');
      results.failed++;
      return;
    }
    
    console.log('  ✅ Setup script exists and is built');
    results.passed++;
    
    // Check if setup UI has been cleaned up (should not have excessive debug output)
    const setupUIPath = path.join(PROJECT_ROOT, 'src/utils/setup-ui.ts');
    if (fs.existsSync(setupUIPath)) {
      const content = fs.readFileSync(setupUIPath, 'utf8');
      
      // Check that debug output is conditional
      if (content.includes('process.env.DEBUG_SETUP')) {
        console.log('  ✅ Setup UI has conditional debug output');
        results.passed++;
      } else {
        console.log('  ⚠️  Setup UI might have unconditional debug output');
        results.warnings++;
      }
    }
  } catch (error) {
    console.log(`  ❌ Error validating setup features: ${error.message}`);
    results.failed++;
  }
}

/**
 * Validate MCP tools documentation
 */
async function validateMCPTools(results) {
  try {
    const toolsDocPath = path.join(PROJECT_ROOT, 'docs/api/mcp-tools-reference.md');
    
    if (!fs.existsSync(toolsDocPath)) {
      console.log('  ❌ MCP tools reference documentation not found');
      results.failed++;
      return;
    }
    
    const content = fs.readFileSync(toolsDocPath, 'utf8');
    
    // Check for implementation status labels
    if (content.includes('🚧 **Basic Implementation**')) {
      console.log('  ✅ Contains implementation status indicators');
      results.passed++;
    } else {
      console.log('  ⚠️  Missing implementation status indicators');
      results.warnings++;
    }
    
    // Check for proper caveats about planned features
    if (content.includes('planned for future releases')) {
      console.log('  ✅ Contains appropriate future feature caveats');
      results.passed++;
    } else {
      console.log('  ⚠️  Missing future feature caveats');
      results.warnings++;
    }
    
    // Ensure it doesn't claim non-existent advanced features
    const problematicClaims = [
      'Advanced index suggestions',
      'detailed complexity scoring',
      'comprehensive optimization analysis'
    ];
    
    let hasProblematicClaims = false;
    for (const claim of problematicClaims) {
      if (content.includes(claim)) {
        console.log(`  ❌ Contains unimplemented feature claim: "${claim}"`);
        results.failed++;
        hasProblematicClaims = true;
      }
    }
    
    if (!hasProblematicClaims) {
      console.log('  ✅ No unimplemented feature claims found');
      results.passed++;
    }
    
  } catch (error) {
    console.log(`  ❌ Error validating MCP tools documentation: ${error.message}`);
    results.failed++;
  }
}

/**
 * Validate configuration examples
 */
async function validateConfigurationExamples(results) {
  try {
    const configDocPath = path.join(PROJECT_ROOT, 'docs/guides/configuration-guide.md');
    
    if (!fs.existsSync(configDocPath)) {
      console.log('  ❌ Configuration guide not found');
      results.failed++;
      return;
    }
    
    const content = fs.readFileSync(configDocPath, 'utf8');
    
    // Check that unimplemented features are properly marked
    if (content.includes('Advanced Configuration (Planned Features)')) {
      console.log('  ✅ Unimplemented features properly marked as planned');
      results.passed++;
    } else {
      console.log('  ⚠️  Advanced features not properly marked as planned');
      results.warnings++;
    }
    
    // Ensure problematic command examples are removed
    const problematicCommands = [
      '--config-template',
      'sql-mcp-encrypt',
      'updateSecurityConfig',
      '--profile='
    ];
    
    let hasProblematicCommands = false;
    for (const command of problematicCommands) {
      if (content.includes(command) && !content.includes('planned for future')) {
        console.log(`  ❌ Contains unimplemented command: "${command}"`);
        results.failed++;
        hasProblematicCommands = true;
      }
    }
    
    if (!hasProblematicCommands) {
      console.log('  ✅ No unimplemented command examples found');
      results.passed++;
    }
    
  } catch (error) {
    console.log(`  ❌ Error validating configuration examples: ${error.message}`);
    results.failed++;
  }
}

// Run validation if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateDocumentation().catch(error => {
    console.error(`${colors.red}❌ Validation script failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}
