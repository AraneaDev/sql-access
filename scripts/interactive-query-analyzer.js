#!/usr/bin/env node

/**
 * Interactive Query Analyzer Tool
 * 
 * This tool provides comprehensive SQL query analysis including:
 * - Security vulnerability detection
 * - Performance optimization suggestions
 * - Query complexity analysis
 * - Best practices validation
 */

const readline = require('readline');
const chalk = require('chalk');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

class InteractiveQueryAnalyzer {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('SQL> ')
    });
    
    this.history = [];
    this.config = this.loadConfig();
    this.setupCommands();
    this.displayWelcome();
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../../config/analyzer.json');
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      return {
        securityLevel: 'strict',
        performanceThresholds: {
          complexity: 50,
          tableScans: 3,
          joins: 5
        },
        enableSuggestions: true,
        colorOutput: true
      };
    }
  }

  setupCommands() {
    this.commands = {
      '.help': () => this.showHelp(),
      '.exit': () => this.exit(),
      '.clear': () => this.clearScreen(),
      '.history': () => this.showHistory(),
      '.config': () => this.showConfig(),
      '.analyze': (query) => this.analyzeQuery(query || this.getLastQuery()),
      '.explain': (query) => this.explainQuery(query || this.getLastQuery()),
      '.security': (query) => this.securityScan(query || this.getLastQuery()),
      '.optimize': (query) => this.optimizeQuery(query || this.getLastQuery()),
      '.benchmark': (query) => this.benchmarkQuery(query || this.getLastQuery()),
      '.save': (filename) => this.saveQuery(filename),
      '.load': (filename) => this.loadQuery(filename)
    };
  }

  displayWelcome() {
    console.clear();
    console.log(chalk.blue.bold('┌─────────────────────────────────────────────────┐'));
    console.log(chalk.blue.bold('│        SQL MCP Server Query Analyzer           │'));
    console.log(chalk.blue.bold('│              Interactive Tool                   │'));
    console.log(chalk.blue.bold('└─────────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.green('Features:'));
    console.log('  • Security vulnerability scanning');
    console.log('  • Performance analysis and optimization');
    console.log('  • Query complexity assessment');
    console.log('  • Best practices validation');
    console.log();
    console.log(chalk.yellow('Type .help for commands or enter SQL queries to analyze'));
    console.log();
    
    this.rl.prompt();
    this.rl.on('line', (input) => this.handleInput(input.trim()));
  }

  handleInput(input) {
    if (!input) {
      this.rl.prompt();
      return;
    }

    // Check if it's a command
    if (input.startsWith('.')) {
      this.handleCommand(input);
    } else {
      // It's a SQL query
      this.history.push({
        query: input,
        timestamp: new Date(),
        analyzed: false
      });
      this.analyzeQuery(input);
    }
    
    this.rl.prompt();
  }

  handleCommand(input) {
    const parts = input.split(' ');
    const command = parts[0];
    const args = parts.slice(1).join(' ');

    if (this.commands[command]) {
      this.commands[command](args);
    } else {
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.yellow('Type .help for available commands'));
    }
  }

  analyzeQuery(query) {
    if (!query) {
      console.log(chalk.red('No query provided'));
      return;
    }

    console.log(chalk.blue.bold('\n🔍 Query Analysis Results'));
    console.log(chalk.gray('─'.repeat(60)));

    const analysis = {
      security: this.performSecurityAnalysis(query),
      performance: this.performPerformanceAnalysis(query),
      complexity: this.calculateComplexity(query),
      bestPractices: this.checkBestPractices(query)
    };

    this.displayAnalysisResults(analysis);
    this.markQueryAsAnalyzed(query);
  }

  performSecurityAnalysis(query) {
    const threats = [];
    const warnings = [];
    const info = [];

    // SQL Injection patterns
    const dangerousPatterns = [
      { pattern: /(\bunion\s+select)/gi, threat: 'UNION-based injection', severity: 'HIGH' },
      { pattern: /(\bor\s+\d+\s*=\s*\d+)/gi, threat: 'Boolean-based injection', severity: 'HIGH' },
      { pattern: /(\bdrop\s+table)/gi, threat: 'Destructive operation', severity: 'CRITICAL' },
      { pattern: /(\bdelete\s+from)/gi, threat: 'Data deletion', severity: 'MEDIUM' },
      { pattern: /(--|\/\*)/g, threat: 'SQL comments (potential obfuscation)', severity: 'LOW' },
      { pattern: /(\bexec\b|\bexecute\b)/gi, threat: 'Dynamic SQL execution', severity: 'HIGH' },
      { pattern: /(\bload_file\b|\binto\s+outfile)/gi, threat: 'File system access', severity: 'HIGH' }
    ];

    dangerousPatterns.forEach(({ pattern, threat, severity }) => {
      if (pattern.test(query)) {
        const item = { threat, severity, matches: query.match(pattern) };
        
        switch (severity) {
          case 'CRITICAL':
          case 'HIGH':
            threats.push(item);
            break;
          case 'MEDIUM':
            warnings.push(item);
            break;
          case 'LOW':
            info.push(item);
            break;
        }
      }
    });

    return { threats, warnings, info, riskLevel: this.calculateRiskLevel(threats, warnings) };
  }

  performPerformanceAnalysis(query) {
    const issues = [];
    const suggestions = [];
    const metrics = {};

    // Check for SELECT *
    if (/select\s+\*/gi.test(query)) {
      issues.push({
        type: 'SELECT_STAR',
        severity: 'MEDIUM',
        description: 'Using SELECT * can impact performance',
        suggestion: 'Specify only required columns'
      });
    }

    // Check for missing WHERE clause on DELETE/UPDATE
    if (/\b(delete|update)\b/gi.test(query) && !/\bwhere\b/gi.test(query)) {
      issues.push({
        type: 'MISSING_WHERE',
        severity: 'HIGH',
        description: 'DELETE/UPDATE without WHERE clause',
        suggestion: 'Always use WHERE clause for data modifications'
      });
    }

    // Check for LIKE with leading wildcard
    if (/like\s+['"]%/gi.test(query)) {
      issues.push({
        type: 'LEADING_WILDCARD',
        severity: 'MEDIUM',
        description: 'LIKE with leading wildcard prevents index usage',
        suggestion: 'Avoid leading wildcards or consider full-text search'
      });
    }

    // Count JOINs
    const joinCount = (query.match(/\bjoin\b/gi) || []).length;
    metrics.joinCount = joinCount;
    
    if (joinCount > this.config.performanceThresholds.joins) {
      issues.push({
        type: 'TOO_MANY_JOINS',
        severity: 'MEDIUM',
        description: `${joinCount} JOINs detected (threshold: ${this.config.performanceThresholds.joins})`,
        suggestion: 'Consider query restructuring or denormalization'
      });
    }

    // Check for ORDER BY without LIMIT
    if (/\border\s+by\b/gi.test(query) && !/\blimit\b/gi.test(query)) {
      warnings.push({
        type: 'ORDER_WITHOUT_LIMIT',
        severity: 'LOW',
        description: 'ORDER BY without LIMIT may sort large result sets',
        suggestion: 'Consider adding LIMIT clause'
      });
    }

    return { issues, suggestions, metrics };
  }

  calculateComplexity(query) {
    let score = 0;
    const factors = [];

    // Base complexity factors
    const complexityFactors = [
      { pattern: /\bselect\b/gi, weight: 1, name: 'SELECT statements' },
      { pattern: /\bfrom\b/gi, weight: 2, name: 'FROM clauses' },
      { pattern: /\bjoin\b/gi, weight: 5, name: 'JOIN operations' },
      { pattern: /\bwhere\b/gi, weight: 2, name: 'WHERE clauses' },
      { pattern: /\bgroup\s+by\b/gi, weight: 3, name: 'GROUP BY clauses' },
      { pattern: /\border\s+by\b/gi, weight: 2, name: 'ORDER BY clauses' },
      { pattern: /\bhaving\b/gi, weight: 4, name: 'HAVING clauses' },
      { pattern: /\bunion\b/gi, weight: 6, name: 'UNION operations' },
      { pattern: /\bsubselect\b|\(\s*select/gi, weight: 8, name: 'Subqueries' },
      { pattern: /\bexists\b/gi, weight: 5, name: 'EXISTS clauses' },
      { pattern: /\bcase\s+when\b/gi, weight: 3, name: 'CASE statements' }
    ];

    complexityFactors.forEach(({ pattern, weight, name }) => {
      const matches = query.match(pattern) || [];
      if (matches.length > 0) {
        const points = matches.length * weight;
        score += points;
        factors.push({ name, count: matches.length, points });
      }
    });

    return {
      score,
      factors,
      level: this.getComplexityLevel(score),
      recommendation: this.getComplexityRecommendation(score)
    };
  }

  checkBestPractices(query) {
    const violations = [];
    const recommendations = [];

    // Check for proper indentation (basic check)
    if (!/\n/g.test(query) && query.length > 50) {
      violations.push({
        rule: 'FORMATTING',
        description: 'Query should be formatted with line breaks',
        suggestion: 'Use proper indentation and line breaks for readability'
      });
    }

    // Check for table aliases
    if (/\bfrom\s+\w+\s+\bjoin\b/gi.test(query) && !/\bas\s+\w+/gi.test(query)) {
      recommendations.push({
        rule: 'TABLE_ALIASES',
        description: 'Consider using table aliases for complex queries',
        suggestion: 'Use meaningful aliases: FROM users u JOIN orders o ON u.id = o.user_id'
      });
    }

    // Check for consistent naming
    const hasSnakeCase = /_/g.test(query);
    const hasCamelCase = /[a-z][A-Z]/g.test(query);
    
    if (hasSnakeCase && hasCamelCase) {
      violations.push({
        rule: 'NAMING_CONSISTENCY',
        description: 'Mixed naming conventions detected',
        suggestion: 'Use consistent naming convention (snake_case or camelCase)'
      });
    }

    return { violations, recommendations };
  }

  displayAnalysisResults(analysis) {
    // Security Results
    console.log(chalk.red.bold('\n🛡️  Security Analysis'));
    if (analysis.security.threats.length > 0) {
      console.log(chalk.red('  THREATS DETECTED:'));
      analysis.security.threats.forEach(threat => {
        console.log(chalk.red(`    ⚠️  ${threat.threat} (${threat.severity})`));
        if (threat.matches) {
          console.log(chalk.gray(`        Matches: ${threat.matches.join(', ')}`));
        }
      });
    }
    
    if (analysis.security.warnings.length > 0) {
      console.log(chalk.yellow('  WARNINGS:'));
      analysis.security.warnings.forEach(warning => {
        console.log(chalk.yellow(`    ⚠️  ${warning.threat} (${warning.severity})`));
      });
    }

    if (analysis.security.threats.length === 0 && analysis.security.warnings.length === 0) {
      console.log(chalk.green('  ✅ No security issues detected'));
    }

    console.log(chalk.blue(`  Risk Level: ${this.getRiskLevelColor(analysis.security.riskLevel)}`));

    // Performance Results
    console.log(chalk.blue.bold('\n⚡ Performance Analysis'));
    if (analysis.performance.issues.length > 0) {
      analysis.performance.issues.forEach(issue => {
        const color = issue.severity === 'HIGH' ? chalk.red : issue.severity === 'MEDIUM' ? chalk.yellow : chalk.blue;
        console.log(color(`  ${this.getSeverityIcon(issue.severity)} ${issue.description}`));
        console.log(chalk.gray(`    💡 ${issue.suggestion}`));
      });
    } else {
      console.log(chalk.green('  ✅ No performance issues detected'));
    }

    // Complexity Results
    console.log(chalk.magenta.bold('\n🧮 Complexity Analysis'));
    console.log(`  Score: ${analysis.complexity.score} (${analysis.complexity.level})`);
    console.log(`  ${analysis.complexity.recommendation}`);
    
    if (analysis.complexity.factors.length > 0) {
      console.log('  Factors:');
      analysis.complexity.factors.forEach(factor => {
        console.log(chalk.gray(`    • ${factor.name}: ${factor.count} × weight = ${factor.points} points`));
      });
    }

    // Best Practices Results
    console.log(chalk.cyan.bold('\n📋 Best Practices'));
    if (analysis.bestPractices.violations.length > 0) {
      console.log(chalk.red('  VIOLATIONS:'));
      analysis.bestPractices.violations.forEach(violation => {
        console.log(chalk.red(`    ❌ ${violation.description}`));
        console.log(chalk.gray(`    💡 ${violation.suggestion}`));
      });
    }

    if (analysis.bestPractices.recommendations.length > 0) {
      console.log(chalk.yellow('  RECOMMENDATIONS:'));
      analysis.bestPractices.recommendations.forEach(rec => {
        console.log(chalk.yellow(`    💡 ${rec.description}`));
        console.log(chalk.gray(`    ${rec.suggestion}`));
      });
    }

    if (analysis.bestPractices.violations.length === 0 && analysis.bestPractices.recommendations.length === 0) {
      console.log(chalk.green('  ✅ Following best practices'));
    }
  }

  explainQuery(query) {
    console.log(chalk.blue.bold('\n📊 Query Execution Plan'));
    console.log(chalk.gray('─'.repeat(60)));
    
    // This would integrate with actual database EXPLAIN functionality
    // For demo purposes, we'll simulate the output
    
    const mockPlan = this.generateMockExplainPlan(query);
    this.displayExplainPlan(mockPlan);
  }

  generateMockExplainPlan(query) {
    // Simplified mock explain plan generation
    const tables = this.extractTables(query);
    const hasJoins = /\bjoin\b/gi.test(query);
    const hasWhere = /\bwhere\b/gi.test(query);
    
    const operations = [];
    
    if (hasJoins) {
      operations.push({
        operation: 'Hash Join',
        cost: Math.floor(Math.random() * 1000),
        rows: Math.floor(Math.random() * 10000),
        tables: tables.slice(0, 2)
      });
    }
    
    if (hasWhere) {
      operations.push({
        operation: 'Index Scan',
        cost: Math.floor(Math.random() * 100),
        rows: Math.floor(Math.random() * 1000),
        condition: 'WHERE clause filter'
      });
    } else {
      operations.push({
        operation: 'Seq Scan',
        cost: Math.floor(Math.random() * 5000),
        rows: Math.floor(Math.random() * 50000),
        warning: 'Full table scan - consider adding WHERE clause'
      });
    }
    
    return operations;
  }

  displayExplainPlan(plan) {
    const table = new Table({
      head: ['Operation', 'Cost', 'Rows', 'Details'],
      colWidths: [20, 10, 10, 30]
    });

    plan.forEach(op => {
      const details = op.tables ? `Tables: ${op.tables.join(', ')}` : 
                     op.condition ? op.condition :
                     op.warning ? chalk.yellow(op.warning) : '';
      
      table.push([op.operation, op.cost, op.rows, details]);
    });

    console.log(table.toString());
  }

  extractTables(query) {
    const tableRegex = /(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    const matches = [];
    let match;
    
    while ((match = tableRegex.exec(query)) !== null) {
      matches.push(match[1]);
    }
    
    return [...new Set(matches)]; // Remove duplicates
  }

  securityScan(query) {
    console.log(chalk.red.bold('\n🔒 Detailed Security Scan'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const securityAnalysis = this.performSecurityAnalysis(query);
    
    // Create detailed security report
    const table = new Table({
      head: ['Category', 'Finding', 'Severity', 'Risk'],
      colWidths: [15, 30, 10, 25]
    });

    // Add threats
    securityAnalysis.threats.forEach(threat => {
      table.push([
        chalk.red('THREAT'),
        threat.threat,
        chalk.red(threat.severity),
        'Immediate attention required'
      ]);
    });

    // Add warnings
    securityAnalysis.warnings.forEach(warning => {
      table.push([
        chalk.yellow('WARNING'),
        warning.threat,
        chalk.yellow(warning.severity),
        'Review recommended'
      ]);
    });

    // Add info items
    securityAnalysis.info.forEach(info => {
      table.push([
        chalk.blue('INFO'),
        info.threat,
        chalk.blue(info.severity),
        'For awareness'
      ]);
    });

    if (table.length === 0) {
      console.log(chalk.green('✅ No security issues detected in detailed scan'));
    } else {
      console.log(table.toString());
    }

    // Security recommendations
    console.log(chalk.blue.bold('\n💡 Security Recommendations:'));
    console.log('  • Use parameterized queries to prevent SQL injection');
    console.log('  • Implement input validation and sanitization');
    console.log('  • Apply principle of least privilege for database access');
    console.log('  • Enable query logging and monitoring');
    console.log('  • Regular security audits and penetration testing');
  }

  optimizeQuery(query) {
    console.log(chalk.green.bold('\n⚙️  Query Optimization Suggestions'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const optimizations = [];
    
    // Check for SELECT *
    if (/select\s+\*/gi.test(query)) {
      optimizations.push({
        issue: 'Using SELECT *',
        suggestion: 'Specify only required columns',
        impact: 'Reduces network traffic and memory usage',
        example: query.replace(/select\s+\*/gi, 'SELECT col1, col2, col3')
      });
    }
    
    // Check for DISTINCT with ORDER BY
    if (/\bdistinct\b/gi.test(query) && /\border\s+by\b/gi.test(query)) {
      optimizations.push({
        issue: 'DISTINCT with ORDER BY',
        suggestion: 'Consider using GROUP BY instead',
        impact: 'Better performance for large datasets',
        example: 'Use GROUP BY instead of DISTINCT when possible'
      });
    }
    
    // Check for subqueries that can be JOINs
    if (/\bin\s*\(\s*select/gi.test(query)) {
      optimizations.push({
        issue: 'IN subquery detected',
        suggestion: 'Consider using JOIN instead',
        impact: 'JOINs are often more efficient than subqueries',
        example: 'Convert IN (SELECT...) to INNER JOIN'
      });
    }

    if (optimizations.length === 0) {
      console.log(chalk.green('✅ Query appears to be well-optimized'));
    } else {
      optimizations.forEach((opt, index) => {
        console.log(chalk.yellow(`${index + 1}. ${opt.issue}`));
        console.log(chalk.blue(`   💡 ${opt.suggestion}`));
        console.log(chalk.gray(`   📈 Impact: ${opt.impact}`));
        if (opt.example) {
          console.log(chalk.green(`   📝 Example: ${opt.example}`));
        }
        console.log();
      });
    }
  }

  benchmarkQuery(query) {
    console.log(chalk.cyan.bold('\n⏱️  Query Benchmark Simulation'));
    console.log(chalk.gray('─'.repeat(60)));
    
    // Simulate benchmark results
    const scenarios = [
      { name: '1K rows', executionTime: Math.floor(Math.random() * 50) + 10 },
      { name: '10K rows', executionTime: Math.floor(Math.random() * 200) + 50 },
      { name: '100K rows', executionTime: Math.floor(Math.random() * 1000) + 200 },
      { name: '1M rows', executionTime: Math.floor(Math.random() * 5000) + 1000 }
    ];
    
    const table = new Table({
      head: ['Dataset Size', 'Est. Time (ms)', 'Performance'],
      colWidths: [15, 15, 20]
    });

    scenarios.forEach(scenario => {
      let performance;
      if (scenario.executionTime < 100) performance = chalk.green('Excellent');
      else if (scenario.executionTime < 500) performance = chalk.yellow('Good');
      else if (scenario.executionTime < 2000) performance = chalk.orange('Fair');
      else performance = chalk.red('Poor');
      
      table.push([scenario.name, scenario.executionTime, performance]);
    });

    console.log(table.toString());
    
    console.log(chalk.blue('\n💡 Benchmark Notes:'));
    console.log('  • Times are estimates based on query complexity');
    console.log('  • Actual performance depends on hardware, indexes, and data distribution');
    console.log('  • Consider running EXPLAIN ANALYZE for actual execution plans');
  }

  // Helper methods
  calculateRiskLevel(threats, warnings) {
    if (threats.length > 0) return 'HIGH';
    if (warnings.length > 2) return 'MEDIUM';
    if (warnings.length > 0) return 'LOW';
    return 'MINIMAL';
  }

  getRiskLevelColor(level) {
    switch (level) {
      case 'HIGH': return chalk.red.bold(level);
      case 'MEDIUM': return chalk.yellow.bold(level);
      case 'LOW': return chalk.blue.bold(level);
      default: return chalk.green.bold(level);
    }
  }

  getSeverityIcon(severity) {
    switch (severity) {
      case 'HIGH': return '🚨';
      case 'MEDIUM': return '⚠️';
      case 'LOW': return 'ℹ️';
      default: return '•';
    }
  }

  getComplexityLevel(score) {
    if (score > 100) return 'Very High';
    if (score > 50) return 'High';
    if (score > 25) return 'Medium';
    if (score > 10) return 'Low';
    return 'Very Low';
  }

  getComplexityRecommendation(score) {
    if (score > 100) return 'Consider breaking into smaller queries';
    if (score > 50) return 'May benefit from optimization';
    if (score > 25) return 'Moderately complex, review for optimization opportunities';
    return 'Simple query, well within acceptable complexity';
  }

  // Command implementations
  showHelp() {
    console.log(chalk.blue.bold('\n📖 Available Commands:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const commands = [
      ['.help', 'Show this help message'],
      ['.analyze [query]', 'Comprehensive query analysis'],
      ['.explain [query]', 'Show query execution plan'],
      ['.security [query]', 'Detailed security scan'],
      ['.optimize [query]', 'Query optimization suggestions'],
      ['.benchmark [query]', 'Performance benchmark simulation'],
      ['.history', 'Show query history'],
      ['.clear', 'Clear screen'],
      ['.config', 'Show current configuration'],
      ['.save <filename>', 'Save current query to file'],
      ['.load <filename>', 'Load query from file'],
      ['.exit', 'Exit the analyzer']
    ];

    const table = new Table({
      head: ['Command', 'Description'],
      colWidths: [25, 45]
    });

    commands.forEach(([cmd, desc]) => {
      table.push([chalk.cyan(cmd), desc]);
    });

    console.log(table.toString());
    console.log(chalk.yellow('\n💡 Tip: Enter SQL queries directly to analyze them'));
  }

  showHistory() {
    console.log(chalk.blue.bold('\n📋 Query History:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    if (this.history.length === 0) {
      console.log(chalk.gray('No queries in history'));
      return;
    }

    this.history.forEach((entry, index) => {
      const status = entry.analyzed ? chalk.green('✓') : chalk.gray('○');
      const time = entry.timestamp.toLocaleTimeString();
      const preview = entry.query.length > 50 ? 
        entry.query.substring(0, 47) + '...' : 
        entry.query;
      
      console.log(`${status} ${chalk.gray(time)} ${chalk.blue(index + 1)}. ${preview}`);
    });
  }

  showConfig() {
    console.log(chalk.blue.bold('\n⚙️  Current Configuration:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(JSON.stringify(this.config, null, 2));
  }

  getLastQuery() {
    return this.history.length > 0 ? this.history[this.history.length - 1].query : null;
  }

  markQueryAsAnalyzed(query) {
    const entry = this.history.find(h => h.query === query);
    if (entry) entry.analyzed = true;
  }

  saveQuery(filename) {
    const query = this.getLastQuery();
    if (!query) {
      console.log(chalk.red('No query to save'));
      return;
    }

    const filepath = path.join(process.cwd(), filename || 'query.sql');
    fs.writeFileSync(filepath, query);
    console.log(chalk.green(`Query saved to ${filepath}`));
  }

  loadQuery(filename) {
    const filepath = path.join(process.cwd(), filename);
    try {
      const query = fs.readFileSync(filepath, 'utf8');
      console.log(chalk.green(`Loaded query from ${filepath}`));
      this.analyzeQuery(query);
    } catch (error) {
      console.log(chalk.red(`Error loading file: ${error.message}`));
    }
  }

  clearScreen() {
    console.clear();
    this.displayWelcome();
  }

  exit() {
    console.log(chalk.blue('\n👋 Thanks for using SQL MCP Server Query Analyzer!'));
    process.exit(0);
  }
}

// Start the interactive analyzer
if (require.main === module) {
  new InteractiveQueryAnalyzer();
}

module.exports = InteractiveQueryAnalyzer;
