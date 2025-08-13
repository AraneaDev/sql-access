/**
 * SQL Security Manager with comprehensive validation
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import type {
  SecurityValidation,
  BatchValidationResult,
  QueryValidationResult,
  QueryComplexityAnalysis,
  ComplexityLimits,
  ComplexityRiskLevel,
  SQLToken,
  TokenType,
  AuditLogEntry,
  LogSeverity,
  SecurityManagerConfig,
  ISecurityManager,
  ParsedServerConfig
} from '../types/index.js';
import { SecurityViolationError } from '../types/index.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// SQL Security Manager Implementation
// ============================================================================

export class SecurityManager extends EventEmitter implements ISecurityManager {
  private readonly blockedKeywords = new Set<string>([
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TRUNCATE', 'REPLACE', 'MERGE', 'UPSERT', 'GRANT', 'REVOKE',
    'EXEC', 'EXECUTE', 'CALL', 'SET', 'DECLARE', 'USE', 'LOAD',
    'IMPORT', 'EXPORT', 'BACKUP', 'RESTORE', 'ATTACH', 'DETACH'
  ]);

  private readonly allowedKeywords = new Set<string>([
    'SELECT', 'WITH', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT',
    'RIGHT', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS', 'AND', 'OR',
    'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET',
    'UNION', 'INTERSECT', 'EXCEPT', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CAST', 'CONVERT', 'COALESCE', 'NULLIF',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROW_NUMBER',
    'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE',
    'LAST_VALUE', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC',
    'ISNULL', 'IFNULL', 'NVL', 'SUBSTRING', 'CONCAT',
    'UPPER', 'LOWER', 'TRIM', 'LENGTH', 'ROUND', 'FLOOR', 'CEIL'
  ]);

  private readonly dbSpecificAllowed: Record<string, string[]> = {
    mysql: ['SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN'],
    postgresql: ['\\d', '\\dt', '\\l', 'EXPLAIN', 'ANALYZE'],
    mssql: ['sp_help', 'sp_columns', 'sp_tables'],
    sqlite: ['.schema', '.tables', '.indices']
  };

  private readonly complexityLimits: ComplexityLimits;
  private readonly logger = getLogger();
  private selectOnlyMode: boolean = true;
  private statisticsEnabled: boolean = true;
  private statistics = {
    queriesValidated: 0,
    queriesBlocked: 0,
    queriesAllowed: 0,
    totalComplexity: 0,
    avgComplexity: 0
  };

  constructor(config: SecurityManagerConfig = {}, selectOnlyMode: boolean = true) {
    super(); // Call EventEmitter constructor
    
    this.selectOnlyMode = selectOnlyMode;
    const securityConfig = config.security || {};
    
    this.complexityLimits = {
      maxJoins: this.parseConfigValue(securityConfig.max_joins, 10),
      maxSubqueries: this.parseConfigValue(securityConfig.max_subqueries, 5),
      maxUnions: this.parseConfigValue(securityConfig.max_unions, 3),
      maxGroupBys: this.parseConfigValue(securityConfig.max_group_bys, 5),
      maxComplexityScore: this.parseConfigValue(securityConfig.max_complexity_score, 100),
      maxQueryLength: this.parseConfigValue(securityConfig.max_query_length, 10000)
    };

    this.logger.info('Security manager initialized', {
      limits: this.complexityLimits,
      selectOnlyMode: this.selectOnlyMode
    });
  }

  // ============================================================================
  // Public Interface Methods
  // ============================================================================

  /**
   * Initialize the security manager with server configuration
   */
  public initialize(config: ParsedServerConfig): void {
    // Update complexity limits from configuration if provided
    if (config.security) {
      const securityConfig = config.security;
      
      this.complexityLimits.maxJoins = securityConfig.max_joins || this.complexityLimits.maxJoins;
      this.complexityLimits.maxSubqueries = securityConfig.max_subqueries || this.complexityLimits.maxSubqueries;
      this.complexityLimits.maxUnions = securityConfig.max_unions || this.complexityLimits.maxUnions;
      this.complexityLimits.maxGroupBys = securityConfig.max_group_bys || this.complexityLimits.maxGroupBys;
      this.complexityLimits.maxComplexityScore = securityConfig.max_complexity_score || this.complexityLimits.maxComplexityScore;
      this.complexityLimits.maxQueryLength = securityConfig.max_query_length || this.complexityLimits.maxQueryLength;

      this.logger.info('Security manager configuration updated', {
        limits: this.complexityLimits
      });
    }

    this.emit('initialized', config);
  }

  /**
   * Validate a single SELECT-only query
   */
  validateQuery(query: string, dbType = 'mysql'): Promise<SecurityValidation> {
    this.updateStatistics();
    const result = this.selectOnlyMode ? 
      this.validateSelectOnlyQuery(query, dbType) : 
      this.validateAnyQuery(query, dbType);
    
    if (result.allowed) {
      this.statistics.queriesAllowed++;
      this.emit('query-approved', 'unknown');
    } else {
      this.statistics.queriesBlocked++;
      this.emit('query-blocked', 'unknown', result.reason || 'Unknown reason');
    }
    
    return Promise.resolve(result);
  }

  /**
   * Validate any query (not just SELECT-only) 
   */
  validateAnyQuery(query: string, dbType = 'mysql'): SecurityValidation {
    if (!query || typeof query !== 'string') {
      return {
        allowed: false,
        reason: 'Query is empty or invalid',
        confidence: 1.0
      };
    }

    // Check query length limit
    if (query.length > this.complexityLimits.maxQueryLength) {
      return {
        allowed: false,
        reason: `Query exceeds maximum length of ${this.complexityLimits.maxQueryLength} characters`,
        confidence: 1.0
      };
    }

    // Clean and normalize query
    const normalizedQuery = this.normalizeQuery(query);
    
    // Extract SQL tokens
    const tokens = this.tokenizeQuery(normalizedQuery);
    
    if (tokens.length === 0) {
      return {
        allowed: false,
        reason: 'Query is empty or contains no valid SQL tokens',
        confidence: 1.0
      };
    }

    // Check for dangerous patterns (even in non-SELECT mode)
    const dangerousPatterns = this.checkDangerousPatterns(normalizedQuery);
    if (dangerousPatterns.length > 0) {
      return {
        allowed: false,
        reason: `Query contains dangerous patterns: ${dangerousPatterns.join(', ')}`,
        confidence: 0.95
      };
    }

    // Additional complexity validation
    const complexity = this.analyzeQueryComplexity(query);
    if (complexity.score > this.complexityLimits.maxComplexityScore) {
      return {
        allowed: false,
        reason: `Query complexity score (${complexity.score}) exceeds safety threshold of ${this.complexityLimits.maxComplexityScore}`,
        confidence: 0.8
      };
    }

    // Check individual complexity limits
    if (complexity.joinCount > this.complexityLimits.maxJoins) {
      return {
        allowed: false,
        reason: `Too many JOINs (${complexity.joinCount}), maximum allowed: ${this.complexityLimits.maxJoins}`,
        confidence: 0.9
      };
    }

    if (complexity.subqueryCount > this.complexityLimits.maxSubqueries) {
      return {
        allowed: false,
        reason: `Too many subqueries (${complexity.subqueryCount}), maximum allowed: ${this.complexityLimits.maxSubqueries}`,
        confidence: 0.9
      };
    }

    if (complexity.unionCount > this.complexityLimits.maxUnions) {
      return {
        allowed: false,
        reason: `Too many UNIONs (${complexity.unionCount}), maximum allowed: ${this.complexityLimits.maxUnions}`,
        confidence: 0.9
      };
    }

    if (complexity.groupByCount > this.complexityLimits.maxGroupBys) {
      return {
        allowed: false,
        reason: `Too many GROUP BY clauses (${complexity.groupByCount}), maximum allowed: ${this.complexityLimits.maxGroupBys}`,
        confidence: 0.9
      };
    }

    // If we get here, query is allowed (non-SELECT mode allows all valid queries)
    return { 
      allowed: true, 
      confidence: 0.9 
    };
  }

  /**
   * Analyze query performance characteristics 
   */
  analyzeQuery(query: string): Promise<QueryComplexityAnalysis> {
    return Promise.resolve(this.analyzeQueryComplexity(query));
  }

  /**
   * Analyze performance impact of query
   */
  analyzePerformance(query: string): Promise<{
    executionTime: number;
    explainTime: number;
    rowCount: number;
    columnCount: number;
    executionPlan: string;
    recommendations: string;
  }> {
    // Mock performance analysis - this would integrate with database adapters in real implementation
    return Promise.resolve({
      executionTime: 100,
      explainTime: 50,
      rowCount: 0,
      columnCount: 0,
      executionPlan: 'Mock execution plan for analysis',
      recommendations: 'Mock performance recommendations'
    });
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: SecurityManagerConfig): void {
    if (config.security) {
      // Update complexity limits
      const securityConfig = config.security;
      
      (this.complexityLimits as any).maxJoins = securityConfig.max_joins || this.complexityLimits.maxJoins;
      (this.complexityLimits as any).maxSubqueries = securityConfig.max_subqueries || this.complexityLimits.maxSubqueries;
      (this.complexityLimits as any).maxUnions = securityConfig.max_unions || this.complexityLimits.maxUnions;
      (this.complexityLimits as any).maxGroupBys = securityConfig.max_group_bys || this.complexityLimits.maxGroupBys;
      (this.complexityLimits as any).maxComplexityScore = securityConfig.max_complexity_score || this.complexityLimits.maxComplexityScore;
      (this.complexityLimits as any).maxQueryLength = securityConfig.max_query_length || this.complexityLimits.maxQueryLength;

      this.logger.info('Security manager configuration updated', {
        limits: this.complexityLimits
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityManagerConfig {
    return {
      security: {
        max_joins: this.complexityLimits.maxJoins,
        max_subqueries: this.complexityLimits.maxSubqueries,
        max_unions: this.complexityLimits.maxUnions,
        max_group_bys: this.complexityLimits.maxGroupBys,
        max_complexity_score: this.complexityLimits.maxComplexityScore,
        max_query_length: this.complexityLimits.maxQueryLength
      }
    };
  }

  /**
   * Set SELECT-only mode
   */
  setSelectOnlyMode(enabled: boolean): void {
    this.selectOnlyMode = enabled;
    this.logger.info(`SELECT-only mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if in SELECT-only mode
   */
  isSelectOnlyMode(): boolean {
    return this.selectOnlyMode;
  }

  /**
   * Get security statistics
   */
  getStatistics(): typeof this.statistics {
    return { ...this.statistics };
  }

  /**
   * Update statistics (private helper)
   */
  private updateStatistics(): void {
    this.statistics.queriesValidated++;
    if (this.statistics.queriesValidated > 0) {
      this.statistics.avgComplexity = this.statistics.totalComplexity / this.statistics.queriesValidated;
    }
  }

  /**
   * Validate a single SELECT-only query
   */
  validateSelectOnlyQuery(query: string, dbType = 'mysql'): SecurityValidation {
    if (!query || typeof query !== 'string') {
      return {
        allowed: false,
        reason: 'Query is empty or invalid',
        confidence: 1.0
      };
    }

    // Check query length limit
    if (query.length > this.complexityLimits.maxQueryLength) {
      return {
        allowed: false,
        reason: `Query exceeds maximum length of ${this.complexityLimits.maxQueryLength} characters`,
        confidence: 1.0
      };
    }

    // Clean and normalize query
    const normalizedQuery = this.normalizeQuery(query);
    
    // Extract SQL tokens
    const tokens = this.tokenizeQuery(normalizedQuery);
    
    if (tokens.length === 0) {
      return {
        allowed: false,
        reason: 'Query is empty or contains no valid SQL tokens',
        confidence: 1.0
      };
    }

    // Check first meaningful token
    const firstToken = tokens.find(token => 
      token.type === 'KEYWORD' && token.value.length > 0
    );

    if (!firstToken) {
      return {
        allowed: false,
        reason: 'No SQL command found',
        confidence: 1.0
      };
    }

    const command = firstToken.value.toUpperCase();

    // Check if command is explicitly blocked
    if (this.blockedKeywords.has(command)) {
      return {
        allowed: false,
        reason: `Command '${command}' is not allowed in SELECT-only mode`,
        blockedCommand: command,
        confidence: 1.0
      };
    }

    // Check for allowed commands
    if (this.allowedKeywords.has(command)) {
      // Additional validation for allowed commands
      const deepValidation = this.performDeepValidation(normalizedQuery, tokens);
      return {
        allowed: deepValidation.allowed,
        reason: deepValidation.reason,
        confidence: deepValidation.confidence
      };
    }

    // Check database-specific allowed commands
    const dbAllowed = this.dbSpecificAllowed[dbType] || [];
    if (dbAllowed.some(cmd => command.includes(cmd))) {
      return { 
        allowed: true, 
        confidence: 0.9 
      };
    }

    // Check for dangerous patterns even in allowed commands
    const dangerousPatterns = this.checkDangerousPatterns(normalizedQuery);
    if (dangerousPatterns.length > 0) {
      return {
        allowed: false,
        reason: `Query contains potentially dangerous patterns: ${dangerousPatterns.join(', ')}`,
        confidence: 0.95
      };
    }

    // If we get here, it's probably safe but unknown
    if (command.startsWith('SELECT') || command.startsWith('WITH')) {
      return { 
        allowed: true, 
        confidence: 0.8 
      };
    }

    return {
      allowed: false,
      reason: `Command '${command}' is not recognized as safe for SELECT-only mode`,
      confidence: 0.9
    };
  }

  /**
   * Validate multiple SQL queries in batch against SELECT-only restrictions
   */
  validateBatchSelectOnlyQueries(
    queries: Array<{ query: string; params?: unknown[]; label?: string }>, 
    dbType = 'mysql'
  ): BatchValidationResult {
    const results: QueryValidationResult[] = [];
    let hasViolations = false;
    let totalComplexity = 0;

    for (let i = 0; i < queries.length; i++) {
      const queryObj = queries[i];
      const validation = this.validateSelectOnlyQuery(queryObj.query, dbType);
      
      // Add complexity analysis
      const complexity = this.analyzeQueryComplexity(queryObj.query);
      totalComplexity += complexity.score;
      
      const result: QueryValidationResult = {
        index: i,
        label: queryObj.label || `Query ${i + 1}`,
        query: queryObj.query.substring(0, 100),
        allowed: validation.allowed,
        reason: validation.reason,
        complexity: complexity,
        blockedCommand: validation.blockedCommand
      };
      
      results.push(result);
      
      if (!validation.allowed) {
        hasViolations = true;
      }
    }

    // Check batch-level constraints
    const batchAnalysis = this.analyzeBatchComplexity(queries, totalComplexity);

    return {
      allowed: !hasViolations && batchAnalysis.allowed,
      queries: results,
      batch_analysis: batchAnalysis,
      total_complexity: totalComplexity,
      summary: {
        total_queries: queries.length,
        allowed_queries: results.filter(r => r.allowed).length,
        blocked_queries: results.filter(r => !r.allowed).length,
        high_complexity_queries: results.filter(r => r.complexity.score > 50).length
      }
    };
  }

  /**
   * Analyze query complexity and potential performance impact
   */
  analyzeQueryComplexity(query: string): QueryComplexityAnalysis {
    const upperQuery = query.toUpperCase();
    let score = 0;
    const factors: string[] = [];

    // Count different complexity factors
    const joinCount = (upperQuery.match(/\bJOIN\b/g) || []).length;
    const subqueryCount = (upperQuery.match(/\(\s*SELECT/g) || []).length;
    const unionCount = (upperQuery.match(/\bUNION\b/g) || []).length;
    
    // Count GROUP BY fields more accurately
    let groupByCount = 0;
    const groupByMatch = upperQuery.match(/GROUP\s+BY\s+([\w\s,\(\)\.]+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/);
    if (groupByMatch) {
      // Count commas in the GROUP BY clause to estimate number of grouped fields
      const groupByClause = groupByMatch[1];
      groupByCount = (groupByClause.match(/,/g) || []).length + 1; // +1 for the first field
    }
    
    const orderByCount = (upperQuery.match(/\bORDER\s+BY\b/g) || []).length;
    const windowFuncCount = (upperQuery.match(/\bOVER\s*\(/g) || []).length;

    // Calculate complexity score
    score += joinCount * 5;
    score += subqueryCount * 10;
    score += unionCount * 8;
    score += groupByCount * 3;
    score += orderByCount * 2;
    score += windowFuncCount * 7;

    if (joinCount > 0) factors.push(`${joinCount} joins`);
    if (subqueryCount > 0) factors.push(`${subqueryCount} subqueries`);
    if (unionCount > 0) factors.push(`${unionCount} unions`);
    if (groupByCount > 0) factors.push(`${groupByCount} group by`);
    if (windowFuncCount > 0) factors.push(`${windowFuncCount} window functions`);

    // Query length factor
    const lengthFactor = Math.floor(query.length / 100);
    score += lengthFactor;

    return {
      score,
      factors,
      joinCount,
      subqueryCount,
      unionCount,
      groupByCount,
      windowFuncCount,
      risk_level: this.getComplexityRiskLevel(score)
    };
  }

  /**
   * Create comprehensive audit log entry
   */
  createAuditLog(
    database: string, 
    query: string | string[], 
    allowed: boolean, 
    reason?: string, 
    metadata: Record<string, unknown> = {}
  ): AuditLogEntry {
    const isBatch = Array.isArray(query);
    
    return {
      timestamp: new Date().toISOString(),
      database,
      query_type: isBatch ? 'BATCH' : 'SINGLE',
      query: isBatch 
        ? query.map(q => q.substring(0, 200)).join('; ') 
        : query.substring(0, 500),
      query_count: isBatch ? query.length : 1,
      queryHash: createHash('sha256')
        .update(JSON.stringify(query))
        .digest('hex'),
      allowed,
      reason,
      metadata,
      sourceIP: process.env.CLIENT_IP || 'unknown',
      severity: allowed ? 'INFO' : 'WARNING'
    };
  }

  /**
   * Sanitize error messages to prevent information disclosure
   */
  sanitizeErrorMessage(errorMessage: string): string {
    // Remove potentially sensitive information from error messages
    return errorMessage
      .replace(/password[=:]\s*[^\s;,)]+/gi, 'password=[REDACTED]')
      .replace(/pwd[=:]\s*[^\s;,)]+/gi, 'pwd=[REDACTED]')
      .replace(/token[=:]\s*[^\s;,)]+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*[^\s;,)]+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*[^\s;,)]+/gi, 'secret=[REDACTED]')
      .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, 'XXXX-XXXX-XXXX-XXXX') // Credit card numbers
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, 'XXX-XX-XXXX') // SSN format
      .substring(0, 500); // Limit message length
  }

  // ============================================================================
  // Private Implementation Methods
  // ============================================================================

  private performDeepValidation(query: string, tokens: SQLToken[]): SecurityValidation {
    const upperQuery = query.toUpperCase();

    // Check for nested dangerous commands
    const nestedDangerousPatterns = [
      /SELECT.*INTO\s+(?:OUTFILE|DUMPFILE)/i,
      /SELECT.*LOAD_FILE/i,
      /SELECT.*SYSTEM/i,
      /SELECT.*EXEC/i,
      /SELECT.*;\s*(?:DROP|DELETE|UPDATE|INSERT)/i,
      /UNION.*SELECT.*INTO/i
    ];

    for (const pattern of nestedDangerousPatterns) {
      if (pattern.test(query)) {
        return {
          allowed: false,
          reason: 'Query contains nested dangerous operations',
          confidence: 0.95
        };
      }
    }

    // Check for excessive complexity that might indicate malicious intent
    const complexity = this.analyzeQueryComplexity(query);
    if (complexity.score > this.complexityLimits.maxComplexityScore) {
      return {
        allowed: false,
        reason: `Query complexity score (${complexity.score}) exceeds safety threshold of ${this.complexityLimits.maxComplexityScore}`,
        confidence: 0.8
      };
    }

    // Check individual complexity limits
    if (complexity.joinCount > this.complexityLimits.maxJoins) {
      return {
        allowed: false,
        reason: `Too many JOINs (${complexity.joinCount}), maximum allowed: ${this.complexityLimits.maxJoins}`,
        confidence: 0.9
      };
    }

    if (complexity.subqueryCount > this.complexityLimits.maxSubqueries) {
      return {
        allowed: false,
        reason: `Too many subqueries (${complexity.subqueryCount}), maximum allowed: ${this.complexityLimits.maxSubqueries}`,
        confidence: 0.9
      };
    }

    if (complexity.unionCount > this.complexityLimits.maxUnions) {
      return {
        allowed: false,
        reason: `Too many UNIONs (${complexity.unionCount}), maximum allowed: ${this.complexityLimits.maxUnions}`,
        confidence: 0.9
      };
    }

    if (complexity.groupByCount > this.complexityLimits.maxGroupBys) {
      return {
        allowed: false,
        reason: `Too many GROUP BY clauses (${complexity.groupByCount}), maximum allowed: ${this.complexityLimits.maxGroupBys}`,
        confidence: 0.9
      };
    }

    // Check for suspicious function usage
    const suspiciousFunctions = [
      'BENCHMARK', 'SLEEP', 'USER', 'PASSWORD', 'VERSION',
      'DATABASE', 'SCHEMA', 'CONNECTION_ID'
    ];

    for (const func of suspiciousFunctions) {
      if (upperQuery.includes(func + '(')) {
        return {
          allowed: false,
          reason: `Potentially suspicious function usage: ${func}`,
          confidence: 0.7
        };
      }
    }

    return {
      allowed: true,
      reason: undefined, // Don't provide reason for successful validations
      confidence: 0.95
    };
  }

  private analyzeBatchComplexity(
    queries: Array<{ query: string; params?: unknown[]; label?: string }>, 
    totalComplexity: number
  ) {
    const warnings: string[] = [];
    let allowed = true;

    // Check batch size
    if (queries.length > 10) {
      warnings.push(`Batch size (${queries.length}) exceeds recommended limit of 10`);
      allowed = false;
    }

    // Check total complexity
    if (totalComplexity > 500) {
      warnings.push(`Total batch complexity (${totalComplexity}) is very high`);
      allowed = false;
    }

    // Check for potential resource conflicts
    const tableReferences = this.extractTableReferences(queries);
    if (tableReferences.conflicts.length > 0) {
      warnings.push(`Potential table access conflicts: ${tableReferences.conflicts.join(', ')}`);
    }

    return {
      allowed,
      warnings,
      total_complexity: totalComplexity,
      query_count: queries.length,
      table_references: tableReferences,
      estimated_resource_usage: this.estimateResourceUsage(queries)
    };
  }

  private extractTableReferences(queries: Array<{ query: string; params?: unknown[]; label?: string }>) {
    const tableMap = new Map<string, string[]>();
    const conflicts: string[] = [];

    for (const queryObj of queries) {
      const tables = this.extractTablesFromQuery(queryObj.query);
      
      for (const table of tables) {
        if (!tableMap.has(table)) {
          tableMap.set(table, []);
        }
        tableMap.get(table)!.push(queryObj.label || 'Unnamed query');
      }
    }

    // Check for potential conflicts (same table accessed multiple times)
    for (const [table, accessors] of tableMap) {
      if (accessors.length > 3) {
        conflicts.push(`${table} (${accessors.length} accesses)`);
      }
    }

    return {
      tables: Array.from(tableMap.keys()),
      conflicts,
      access_map: Object.fromEntries(tableMap)
    };
  }

  private extractTablesFromQuery(query: string): string[] {
    const tables: string[] = [];
    const upperQuery = query.toUpperCase();
    
    // Simple regex to find table names after FROM and JOIN
    const fromPattern = /\bFROM\s+([^\s\(,]+)/gi;
    const joinPattern = /\bJOIN\s+([^\s\(,]+)/gi;
    
    let match;
    while ((match = fromPattern.exec(upperQuery)) !== null) {
      tables.push(match[1]!.toLowerCase());
    }
    
    while ((match = joinPattern.exec(upperQuery)) !== null) {
      tables.push(match[1]!.toLowerCase());
    }
    
    return [...new Set(tables)]; // Remove duplicates
  }

  private estimateResourceUsage(queries: Array<{ query: string; params?: unknown[]; label?: string }>) {
    let estimatedCpuIntensity = 0;
    let estimatedMemoryUsage = 0;
    let estimatedIoOperations = 0;

    for (const queryObj of queries) {
      const complexity = this.analyzeQueryComplexity(queryObj.query);
      
      // Simple heuristics for resource estimation
      estimatedCpuIntensity += complexity.joinCount * 2 + complexity.subqueryCount * 3;
      estimatedMemoryUsage += complexity.groupByCount * 10 + complexity.windowFuncCount * 15;
      estimatedIoOperations += queryObj.query.length / 50; // Rough estimate based on query length
    }

    return {
      cpu_intensity: Math.min(estimatedCpuIntensity, 100),
      memory_usage: Math.min(estimatedMemoryUsage, 100),
      io_operations: Math.min(estimatedIoOperations, 100),
      overall_impact: Math.min((estimatedCpuIntensity + estimatedMemoryUsage + estimatedIoOperations) / 3, 100)
    };
  }

  private getComplexityRiskLevel(score: number): ComplexityRiskLevel {
    if (score <= 20) return 'LOW';
    if (score <= 50) return 'MEDIUM';
    if (score <= this.complexityLimits.maxComplexityScore) return 'HIGH';
    return 'CRITICAL';
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/--[^\r\n]*/g, '')       // Remove -- comments
      .replace(/#[^\r\n]*/g, '')        // Remove # comments (MySQL)
      .replace(/\s+/g, ' ')             // Normalize whitespace
      .trim();
  }

  private tokenizeQuery(query: string): SQLToken[] {
    const tokens: SQLToken[] = [];
    const tokenRegex = /(\w+|[().,;]|'[^']*'|"[^"]*"|`[^`]*`)/g;
    let match;

    while ((match = tokenRegex.exec(query)) !== null) {
      const value = match[1]!;
      let type: TokenType = 'IDENTIFIER';

      if (/^[a-zA-Z_]\w*$/.test(value)) {
        const upper = value.toUpperCase();
        if (this.allowedKeywords.has(upper) || this.blockedKeywords.has(upper)) {
          type = 'KEYWORD';
        }
      } else if (/^['"`]/.test(value)) {
        type = 'STRING';
      } else if (/^[().,;]$/.test(value)) {
        type = 'OPERATOR';
      }

      tokens.push({ 
        value, 
        type, 
        position: match.index!,
        normalized: value.toUpperCase()
      });
    }

    return tokens;
  }

  private checkDangerousPatterns(query: string): string[] {
    const dangerous: string[] = [];
    const upperQuery = query.toUpperCase();

    // Enhanced dangerous function patterns
    const dangerousFunctions = [
      'LOAD_FILE', 'INTO OUTFILE', 'INTO DUMPFILE',
      'SYSTEM', 'SHELL', 'EXEC', 'EVAL', 'SCRIPT',
      'BENCHMARK', 'SLEEP\\(', 'WAITFOR DELAY'
    ];

    for (const func of dangerousFunctions) {
      const pattern = new RegExp(func, 'i');
      if (pattern.test(query)) {
        dangerous.push(`Function: ${func}`);
      }
    }

    // Enhanced SQL injection patterns
    const injectionPatterns = [
      /;\s*(DROP|DELETE|UPDATE|INSERT|EXEC|EXECUTE)/i,
      /UNION\s+SELECT.*INTO/i,
      /'\s*OR\s+'1'\s*=\s*'1/i,
      /'\s*OR\s+1\s*=\s*1/i,
      /'\s*;\s*DROP\s+TABLE/i,
      /'\s*UNION\s+SELECT\s+NULL/i,
      /CONCAT\s*\(\s*CHAR\s*\(/i
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(query)) {
        dangerous.push('Potential SQL injection pattern');
        break;
      }
    }

    // Check for privilege escalation attempts
    const privilegePatterns = [
      /CREATE\s+USER/i,
      /GRANT\s+ALL/i,
      /ALTER\s+USER/i,
      /SET\s+PASSWORD/i
    ];

    for (const pattern of privilegePatterns) {
      if (pattern.test(query)) {
        dangerous.push('Privilege escalation attempt');
        break;
      }
    }

    return dangerous;
  }

  private parseConfigValue(value: string | number | undefined, defaultValue: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
  }
}
