/**
 * Query Result Formatting Utilities
 * Provides various formatting options for SQL query results
 */

import type { QueryResult, BatchResult } from '../types/index.js';

/**
 * Formatting options for query results
 */
export interface FormatOptions {
  maxRows?: number;
  maxColumnWidth?: number;
  includeHeaders?: boolean;
  includeRowNumbers?: boolean;
  truncateStrings?: boolean;
  dateFormat?: 'iso' | 'locale' | 'timestamp';
  numberPrecision?: number;
}

/**
 * Default formatting options
 */
const DEFAULT_OPTIONS: Required<FormatOptions> = {
  maxRows: 20,
  maxColumnWidth: 50,
  includeHeaders: true,
  includeRowNumbers: false,
  truncateStrings: true,
  dateFormat: 'iso',
  numberPrecision: 2
};

/**
 * Format query results as a markdown table
 */
export function formatAsTable(result: QueryResult, options: FormatOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!result.rows || result.rows.length === 0) {
    return 'No results returned.\n';
  }

  const fields = result.fields || [];
  if (fields.length === 0) {
    return 'No columns returned.\n';
  }

  // Prepare columns with row numbers if requested
  const columns = opts.includeRowNumbers ? ['#', ...fields] : fields;
  const maxWidth = opts.maxColumnWidth;

  // Create table header
  let table = '';
  if (opts.includeHeaders) {
    table += '| ' + columns.map(col => truncateString(col, maxWidth)).join(' | ') + ' |\n';
    table += '|' + columns.map(() => '---').join('|') + '|\n';
  }

  // Add rows
  const rowsToShow = Math.min(result.rows.length, opts.maxRows);
  for (let i = 0; i < rowsToShow; i++) {
    const row = result.rows[i];
    const values: string[] = [];

    // Add row number if requested
    if (opts.includeRowNumbers) {
      values.push((i + 1).toString());
    }

    // Add data values
    for (const field of fields) {
      const value = formatValue(row[field], opts);
      values.push(truncateString(value, maxWidth));
    }

    table += '| ' + values.join(' | ') + ' |\n';
  }

  // Add truncation notice
  if (result.rows.length > rowsToShow) {
    table += `\n... and ${result.rows.length - rowsToShow} more rows`;
    if (result.truncated) {
      table += ' (results were truncated by server)';
    }
    table += '\n';
  } else if (result.truncated) {
    table += '\n*Results were truncated by server*\n';
  }

  return table;
}

/**
 * Format query results as JSON
 */
export function formatAsJSON(result: QueryResult, pretty = true): string {
  const output = {
    rows: result.rows,
    rowCount: result.rowCount,
    fields: result.fields,
    truncated: result.truncated,
    executionTimeMs: result.execution_time_ms
  };

  return JSON.stringify(output, null, pretty ? 2 : 0);
}

/**
 * Format query results as CSV
 */
export function formatAsCSV(result: QueryResult, options: FormatOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!result.rows || result.rows.length === 0) {
    return '';
  }

  const fields = result.fields || [];
  if (fields.length === 0) {
    return '';
  }

  let csv = '';

  // Add header row if requested
  if (opts.includeHeaders) {
    csv += fields.map(field => escapeCSVValue(field)).join(',') + '\n';
  }

  // Add data rows
  const rowsToShow = Math.min(result.rows.length, opts.maxRows);
  for (let i = 0; i < rowsToShow; i++) {
    const row = result.rows[i];
    const values = fields.map(field => {
      const value = formatValue(row[field], opts);
      return escapeCSVValue(value);
    });
    csv += values.join(',') + '\n';
  }

  return csv;
}

/**
 * Format batch query results
 */
export function formatBatchResults(batchResult: BatchResult, options: FormatOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  let output = `**Batch Query Results**\n\n`;
  output += `📊 **Summary:**\n`;
  output += `   • Total Time: ${batchResult.totalExecutionTime}ms\n`;
  output += `   • Queries: ${batchResult.results.length}\n`;
  output += `   • Successful: ${batchResult.successCount} ✅\n`;
  output += `   • Failed: ${batchResult.failureCount}${batchResult.failureCount > 0 ? ' ❌' : ''}\n`;
  if (batchResult.transactionUsed) {
    output += `   • Transaction: Used 🔄\n`;
  }
  output += `\n`;

  // Show individual results
  for (const queryResult of batchResult.results) {
    output += `**${queryResult.label || `Query ${queryResult.index + 1}`}**\n`;
    
    if (queryResult.success && queryResult.data) {
      output += `✅ Success`;
      if (queryResult.data.execution_time_ms) {
        output += ` (${queryResult.data.execution_time_ms}ms)`;
      }
      output += `\n`;
      
      if (queryResult.data.rows && queryResult.data.rows.length > 0) {
        const condensedOpts = { ...opts, maxRows: 3, maxColumnWidth: 20 };
        output += formatAsTable(queryResult.data, condensedOpts);
      } else {
        output += 'No results returned\n';
      }
    } else {
      output += `❌ Error: ${queryResult.error}\n`;
    }
    
    output += `Query: \`${truncateString(queryResult.query || '', 100)}\`\n\n`;
  }

  return output;
}

/**
 * Format a summary of query results
 */
export function formatSummary(result: QueryResult): string {
  let summary = `📊 **Query Summary**\n`;
  summary += `   • Rows: ${result.rowCount}`;
  if (result.truncated) {
    summary += ` (showing ${result.rows.length})`;
  }
  summary += `\n`;
  summary += `   • Columns: ${result.fields.length}\n`;
  if (result.execution_time_ms) {
    summary += `   • Execution Time: ${result.execution_time_ms}ms\n`;
  }

  // Show column summary
  if (result.fields.length > 0) {
    summary += `   • Fields: ${result.fields.slice(0, 5).join(', ')}`;
    if (result.fields.length > 5) {
      summary += ` and ${result.fields.length - 5} more`;
    }
    summary += `\n`;
  }

  return summary;
}

/**
 * Format performance analysis results
 */
export function formatPerformanceAnalysis(analysis: {
  executionTime: number;
  explainTime: number;
  rowCount: number;
  columnCount: number;
  executionPlan: string;
  recommendations: string;
}): string {
  let output = `🔍 **Query Performance Analysis**\n\n`;
  
  output += `⏱️ **Execution Times:**\n`;
  output += `   • Query Execution: ${analysis.executionTime}ms\n`;
  output += `   • Explain Analysis: ${analysis.explainTime}ms\n\n`;

  output += `📊 **Query Results:**\n`;
  output += `   • Rows: ${analysis.rowCount}\n`;
  output += `   • Columns: ${analysis.columnCount}\n\n`;

  output += `🛠️ **Execution Plan:**\n`;
  output += '```\n';
  output += analysis.executionPlan;
  output += '\n```\n\n';

  output += `💡 **Recommendations:**\n`;
  output += analysis.recommendations;

  return output;
}

/**
 * Format value based on type and options
 */
function formatValue(value: any, options: Required<FormatOptions>): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return options.truncateStrings ? truncateString(value, options.maxColumnWidth) : value;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(options.numberPrecision);
  }

  if (value instanceof Date) {
    switch (options.dateFormat) {
      case 'iso':
        return value.toISOString();
      case 'locale':
        return value.toLocaleString();
      case 'timestamp':
        return value.getTime().toString();
      default:
        return value.toString();
    }
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }

  return String(value);
}

/**
 * Truncate string to maximum length
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Escape CSV value
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Format connection test results
 */
export function formatConnectionTest(result: {
  success: boolean;
  database: string;
  message?: string;
  error?: string;
  sshTunnel?: boolean;
  selectOnlyMode?: boolean;
  schemaCaptured?: boolean;
  schemaInfo?: {
    tableCount: number;
    viewCount: number;
    totalColumns: number;
  };
}): string {
  let output = '';

  if (result.success) {
    output = `✅ **Connection Successful** (${result.database})\n`;
    if (result.sshTunnel) output += `🔒 SSH tunnel established\n`;
    if (result.selectOnlyMode) output += `🛡️ SELECT-only mode active\n`;
    if (result.schemaCaptured && result.schemaInfo) {
      output += `📊 Schema captured: ${result.schemaInfo.tableCount} tables`;
      if (result.schemaInfo.viewCount > 0) {
        output += `, ${result.schemaInfo.viewCount} views`;
      }
      output += `, ${result.schemaInfo.totalColumns} columns\n`;
    }
    if (result.message) {
      output += `📝 ${result.message}\n`;
    }
  } else {
    output = `❌ **Connection Failed** (${result.database})\n`;
    if (result.error) {
      output += `🚫 Error: ${result.error}\n`;
    }
  }

  return output;
}

/**
 * Format database list
 */
export function formatDatabaseList(databases: Array<{
  name: string;
  type: string;
  host: string;
  database?: string;
  sshEnabled: boolean;
  sslEnabled: boolean;
  selectOnlyMode: boolean;
  schemaCached: boolean;
  schemaInfo?: {
    tableCount: number;
    viewCount: number;
    totalColumns: number;
  };
}>): string {
  let output = '📋 **Configured Databases:**\n\n';

  for (const db of databases) {
    output += `🗄️  **${db.name}** (${db.type})\n`;
    output += `   📍 Host: ${db.host}\n`;
    if (db.database) {
      output += `   🏷️  Database: ${db.database}\n`;
    }
    
    // Security and connection info
    const features: string[] = [];
    if (db.sshEnabled) features.push('🔒 SSH');
    if (db.sslEnabled) features.push('🛡️ SSL');
    if (db.selectOnlyMode) features.push('🛡️ SELECT-only');
    
    if (features.length > 0) {
      output += `   🔧 Features: ${features.join(', ')}\n`;
    }
    
    // Schema info
    if (db.schemaCached && db.schemaInfo) {
      output += `   📊 Schema: ${db.schemaInfo.tableCount} tables`;
      if (db.schemaInfo.viewCount > 0) {
        output += `, ${db.schemaInfo.viewCount} views`;
      }
      output += `, ${db.schemaInfo.totalColumns} columns\n`;
    } else {
      output += `   ⏳ Schema not yet captured\n`;
    }
    
    output += '\n';
  }

  return output;
}

/**
 * Create a condensed table format for batch results
 */
export function formatCondensedTable(result: QueryResult, maxRows = 3, maxCols = 4): string {
  if (!result.rows || result.rows.length === 0) {
    return 'No results.\n';
  }

  const fields = result.fields.slice(0, maxCols);
  const hasMoreCols = result.fields.length > maxCols;

  // Create header
  let table = '| ' + fields.join(' | ');
  if (hasMoreCols) table += ' | ... ';
  table += ' |\n';

  table += '|' + fields.map(() => '---').join('|');
  if (hasMoreCols) table += '|---|';
  table += '|\n';

  // Add rows
  const rowsToShow = Math.min(result.rows.length, maxRows);
  for (let i = 0; i < rowsToShow; i++) {
    const row = result.rows[i];
    const values = fields.map(field => {
      const val = row[field];
      if (val === null || val === undefined) return 'NULL';
      const str = String(val);
      return str.length > 20 ? str.substring(0, 17) + '...' : str;
    });
    
    table += '| ' + values.join(' | ');
    if (hasMoreCols) table += ' | ... ';
    table += ' |\n';
  }

  if (result.rows.length > rowsToShow) {
    table += `... and ${result.rows.length - rowsToShow} more rows\n`;
  }

  return table + '\n';
}
