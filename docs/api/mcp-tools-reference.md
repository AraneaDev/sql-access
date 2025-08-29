# MCP Tools Reference

This document provides comprehensive documentation for all MCP tools exposed by the SQL MCP Server. These tools enable Claude Desktop to interact with your configured databases securely and efficiently.

## 🔧 Feature Status

- ✅ **Implemented**: Core query execution, SSH tunneling, SELECT-only security, batch operations, database listing, schema management, connection testing
- 🚧 **Basic Implementation**: Performance analysis (basic recommendations only)
- 📋 **Planned**: Advanced performance analysis with detailed index recommendations, configuration templates, enhanced schema relationship mapping

## 🗄️ Available Tools

### `sql_query`
Execute a single SQL query on a configured database with automatic schema awareness and security enforcement.

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | `string` | ✅ | Database name from configuration |
| `query` | `string` | ✅ | SQL query to execute |
| `params` | `string[]` | ❌ | Optional query parameters for prepared statements |

#### Features
- **Security Validation**: Automatic query validation for SELECT-only mode
- **Schema Awareness**: Uses cached schema information for context
- **SSH Tunneling**: Automatic SSH tunnel establishment if configured
- **Result Formatting**: Structured table output with row limits
- **Performance Tracking**: Query execution time measurement

#### Example Usage
```sql
-- Simple SELECT query
SELECT u.name, u.email, COUNT(o.id) as order_count 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name, u.email 
ORDER BY order_count DESC 
LIMIT 10
```

#### Response Format
- ✅ Success response with formatted table
- 📊 Row count and execution time
- 🔒 Security mode indicators (SSH tunnel, SELECT-only)
- 📋 Structured results with column headers

#### Security Considerations
- In SELECT-only mode, only SELECT, WITH, SHOW, EXPLAIN, and DESCRIBE statements are allowed
- Query complexity is analyzed and limited based on configuration
- Dangerous patterns are automatically detected and blocked

---

### `sql_batch_query`
Execute multiple SQL queries in batch for improved performance with optional transaction support.

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | `string` | ✅ | Database name from configuration |
| `queries` | `object[]` | ✅ | Array of SQL queries to execute |
| `transaction` | `boolean` | ❌ | Execute all queries in a single transaction (default: false) |

#### Query Object Structure
```typescript
{
  query: string;        // SQL query to execute
  params?: string[];    // Optional query parameters
  label?: string;       // Optional label for identification
}
```

#### Features
- **Batch Processing**: Execute up to configurable max queries (default: 10)
- **Transaction Support**: Optional transactional execution for consistency
- **Individual Results**: Detailed results for each query in the batch
- **Failure Handling**: Continues on failures unless in transaction mode
- **Performance Metrics**: Total and individual query execution times

#### Example Usage
```json
{
  "database": "analytics",
  "queries": [
    {
      "query": "SELECT COUNT(*) as total_users FROM users",
      "label": "User Count"
    },
    {
      "query": "SELECT COUNT(*) as total_orders FROM orders WHERE created_at > ?",
      "params": ["2024-01-01"],
      "label": "Recent Orders"
    },
    {
      "query": "SELECT AVG(order_total) as avg_order_value FROM orders",
      "label": "Average Order Value"
    }
  ],
  "transaction": false
}
```

#### Response Format
- 🚀 **Execution Summary**: Total time, query counts, success/failure rates
- 📊 **Individual Results**: Success status, data, and timing for each query
- 🔄 **Transaction Status**: Whether transaction was used and its outcome
- 🛡️ **Security Indicators**: SELECT-only mode, SSH tunnel status

#### Limitations
- Maximum batch size is configurable (default: 10 queries)
- All queries must pass security validation
- Transaction mode requires full database access (not SELECT-only)

---

### `sql_analyze_performance`
Analyze query performance and provide optimization recommendations using database EXPLAIN plans.

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | `string` | ✅ | Database name from configuration |
| `query` | `string` | ✅ | SQL query to analyze |

#### Features
- **Execution Plan Analysis**: Database-specific EXPLAIN query execution
- **Performance Metrics**: Execution time, row counts, column analysis
- **Optimization Recommendations**: Automated suggestions for improvements
- **Database-Specific**: Tailored analysis for PostgreSQL, MySQL, SQLite, SQL Server

#### Example Usage
```sql
SELECT u.name, u.email, p.title, p.created_at
FROM users u
JOIN posts p ON u.id = p.user_id
WHERE u.status = 'active'
  AND p.created_at > CURRENT_DATE - INTERVAL '30 days'
ORDER BY p.created_at DESC
```

#### Response Format
- ⏱️ **Execution Times**: Query execution time and explain analysis time (in milliseconds)
- 📊 **Query Results**: Row count and column count from actual execution
- 🛠️ **Execution Plan**: Raw database execution plan output
- 💡 **Performance Recommendations**: Basic optimization suggestions (generic recommendations)

#### Current Recommendations Include
- Query execution time analysis
- Result set size warnings
- Basic JOIN optimization suggestions
- Database-specific execution plan analysis (PostgreSQL, MySQL, SQLite)
- Generic performance tips (LIMIT usage, SELECT * warnings)

**Note:** Advanced index recommendations and detailed query optimization analysis are planned for future releases.

---

### `sql_list_databases`
List all configured databases with their connection status, security settings, and schema information.

#### Parameters
No parameters required.

#### Features
- **Configuration Overview**: All registered databases
- **Connection Status**: Active/inactive connection information
- **Security Settings**: SELECT-only mode, SSL, SSH tunnel status
- **Schema Information**: Cached schema metadata summary
- **Global Security Limits**: System-wide security configuration

#### Response Format
```
📋 Configured Databases:

🗄️ **production** (postgresql)
   📍 db.company.com:5432
   🔒 SSH tunnel enabled
   🛡️ SSL enabled
   🛡️ Security: SELECT-only mode (production safe)
      ✅ Allows: SELECT, WITH, SHOW, EXPLAIN, DESCRIBE
      🚫 Blocks: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
   📊 Schema: 45 tables, 1,247 columns

🗄️ **analytics** (mysql)
   📍 analytics.company.com:3306
   🛡️ SSL enabled
   ⚠️ Security: Full access mode (use with caution)
   📊 Schema: 12 tables, 89 columns

🔒 **Global Security Limits:**
   • Max JOINs: 10
   • Max Subqueries: 5
   • Max UNIONs: 3
   • Max GROUP BYs: 5
   • Max Complexity Score: 100
   • Max Query Length: 10000
```

---

### `sql_get_schema`
Retrieve detailed schema information for a database including tables, columns, and relationships.

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | `string` | ✅ | Database name to get schema for |
| `table` | `string` | ❌ | Optional: Get schema for specific table only |

#### Features
- **Complete Schema**: Tables, views, columns, data types
- **Relationship Information**: Foreign keys and constraints
- **Column Details**: Types, nullability, defaults, constraints
- **Filtered Output**: Optional single table focus
- **Cached Results**: Fast retrieval from schema cache

#### Response Format
For complete database schema:
```
📊 **Database Schema: production** (postgresql)

🗂️ **Tables (45)**

📋 **users**
   └── id: bigint (PK, NOT NULL, AUTO_INCREMENT)
   └── name: varchar(255) (NOT NULL)
   └── email: varchar(255) (UNIQUE, NOT NULL)
   └── created_at: timestamp (NOT NULL, DEFAULT: CURRENT_TIMESTAMP)
   └── updated_at: timestamp (NOT NULL, DEFAULT: CURRENT_TIMESTAMP)

📋 **posts**
   └── id: bigint (PK, NOT NULL, AUTO_INCREMENT)
   └── user_id: bigint (FK → users.id, NOT NULL)
   └── title: varchar(500) (NOT NULL)
   └── content: text
   └── published: boolean (NOT NULL, DEFAULT: false)
   └── created_at: timestamp (NOT NULL, DEFAULT: CURRENT_TIMESTAMP)

🔍 **Views (8)**
... [additional tables and views]

📈 **Summary**
   • Tables: 45
   • Views: 8
   • Total Columns: 1,247
   • Foreign Keys: 23
```

For single table:
```
📋 **Table: users** (production)

**Columns:**
├── id: bigint (PRIMARY KEY, NOT NULL, AUTO_INCREMENT)
├── name: varchar(255) (NOT NULL)
├── email: varchar(255) (UNIQUE, NOT NULL)
├── status: enum('active','inactive','suspended') (NOT NULL, DEFAULT: 'active')
├── created_at: timestamp (NOT NULL, DEFAULT: CURRENT_TIMESTAMP)
└── updated_at: timestamp (NOT NULL, DEFAULT: CURRENT_TIMESTAMP)

**Indexes:**
├── PRIMARY KEY (id)
├── UNIQUE KEY uk_users_email (email)
└── KEY idx_users_status (status)

**Foreign Keys:**
└── No foreign key relationships

**Referenced By:**
├── posts.user_id → users.id
├── orders.user_id → users.id
└── user_sessions.user_id → users.id
```

---

### `sql_test_connection`
Test connectivity to a database, establish SSH tunnels if needed, and capture schema information.

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | `string` | ✅ | Database name to test |

#### Features
- **Connection Validation**: Full connection test including authentication
- **SSH Tunnel Testing**: Validates SSH tunnel connectivity
- **Schema Capture**: Attempts to capture basic schema information
- **Performance Testing**: Basic connectivity performance measurement
- **Configuration Validation**: Validates database configuration

#### Response Format
**Successful Connection:**
```
✅ Connection successful to production
🔒 SSH tunnel established
🛡️ SELECT-only mode active
📊 Schema captured: 45 tables, 1,247 columns
```

**Failed Connection:**
```
❌ Connection failed to production: Connection timeout after 30000ms

Troubleshooting:
- Verify database host and port are correct
- Check firewall rules allow connections
- Ensure SSH tunnel configuration is valid
- Verify database credentials are correct
```

#### Use Cases
- Initial database setup validation
- Troubleshooting connection issues
- Verifying SSH tunnel configuration
- Schema capture after database changes

---

### `sql_refresh_schema`
Refresh cached schema information for a database after structural changes.

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `database` | `string` | ✅ | Database name to refresh schema for |

#### Features
- **Force Refresh**: Bypasses cache and re-captures schema
- **Complete Rebuild**: Updates all tables, views, and relationships
- **Performance Optimized**: Efficient schema discovery queries
- **Cache Update**: Updates in-memory schema cache

#### Response Format
```
✅ Schema refreshed for production
📊 Captured: 45 tables, 1,247 columns

**Changes Detected:**
• 2 new tables added
• 1 table modified (new columns)
• 3 new indexes created
```

#### When to Use
- After database schema changes
- When schema cache becomes stale
- Before important query operations
- During database migration processes

---

## 🔒 Security Model

### SELECT-Only Mode
When `select_only=true` in database configuration:

**Allowed Operations:**
- `SELECT` - Data retrieval queries
- `WITH` - Common table expressions
- `SHOW` - Database information queries
- `EXPLAIN` - Query execution plans
- `DESCRIBE` - Table structure queries

**Blocked Operations:**
- `INSERT`, `UPDATE`, `DELETE` - Data modification
- `DROP`, `CREATE`, `ALTER` - Schema changes
- `TRUNCATE` - Data deletion
- `GRANT`, `REVOKE` - Permission changes
- `EXEC`, `CALL` - Stored procedure execution

### Query Complexity Limits
All queries are analyzed for complexity and resource usage:

| Limit | Default | Description |
|-------|---------|-------------|
| Max JOINs | 10 | Maximum number of JOIN operations |
| Max Subqueries | 5 | Maximum nested subqueries |
| Max UNIONs | 3 | Maximum UNION operations |
| Max GROUP BYs | 5 | Maximum GROUP BY clauses |
| Max Complexity Score | 100 | Overall query complexity limit |
| Max Query Length | 10,000 | Maximum character length |

### Dangerous Pattern Detection
The system automatically detects and blocks:
- SQL injection attempts
- File system access operations
- System command execution
- Privilege escalation attempts
- Data exfiltration patterns

---

## 🚀 Performance Features

### Result Set Management
- **Row Limiting**: Configurable maximum rows per query (default: 1,000)
- **Truncation Indicators**: Clear indication when results are limited
- **Memory Management**: Efficient handling of large result sets
- **Streaming**: Support for large query results

### Connection Optimization
- **Connection Pooling**: Reuse database connections across queries
- **SSH Tunnel Reuse**: Persistent SSH tunnels for remote databases
- **Health Monitoring**: Automatic connection health checks
- **Timeout Management**: Configurable query and connection timeouts

### Schema Caching
- **In-Memory Cache**: Fast schema access without database queries
- **Automatic Refresh**: Schema updates on connection changes
- **Selective Caching**: Option to cache specific tables or databases
- **Cache Invalidation**: Manual and automatic cache refresh

---

## 🔧 Error Handling

### Common Error Responses

#### Connection Errors
```
❌ Connection failed to database: Connection timeout
Troubleshooting:
- Verify host and port configuration
- Check network connectivity
- Ensure database is running
- Validate credentials
```

#### Security Violations
```
❌ Query blocked: INSERT is not allowed in SELECT-only mode
Security Information:
This database is configured with SELECT-only mode for safety.
Only SELECT, WITH, SHOW, EXPLAIN, and DESCRIBE statements are allowed.
```

#### Query Complexity Errors
```
❌ Query complexity exceeds limits: 15 JOINs (max: 10)
Suggestions:
- Break complex queries into smaller parts
- Use temporary tables for intermediate results
- Consider query optimization techniques
```

#### SSH Tunnel Errors
```
❌ SSH tunnel failed: Authentication failed
Troubleshooting:
- Verify SSH credentials
- Check SSH key permissions
- Ensure SSH server is accessible
- Validate tunnel configuration
```

---

## 📊 Usage Examples

### Basic Query Execution
```json
{
  "tool": "sql_query",
  "arguments": {
    "database": "production",
    "query": "SELECT COUNT(*) as user_count FROM users WHERE status = 'active'"
  }
}
```

### Batch Analytics Query
```json
{
  "tool": "sql_batch_query",
  "arguments": {
    "database": "analytics",
    "queries": [
      {
        "query": "SELECT DATE(created_at) as date, COUNT(*) as signups FROM users WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY date",
        "params": ["2024-01-01"],
        "label": "Daily Signups"
      },
      {
        "query": "SELECT COUNT(*) as active_users FROM users WHERE last_login >= ? AND status = 'active'",
        "params": ["2024-07-01"],
        "label": "Active Users Last Month"
      }
    ],
    "transaction": false
  }
}
```

### Performance Analysis
```json
{
  "tool": "sql_analyze_performance",
  "arguments": {
    "database": "production",
    "query": "SELECT u.name, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.created_at > '2024-01-01' GROUP BY u.id, u.name HAVING COUNT(o.id) > 10 ORDER BY order_count DESC"
  }
}
```

### Schema Exploration
```json
{
  "tool": "sql_get_schema",
  "arguments": {
    "database": "production",
    "table": "users"
  }
}
```

---

## 🔍 Best Practices

### Query Writing
1. **Use Parameterized Queries**: Always use parameter binding for dynamic values
2. **Limit Result Sets**: Include LIMIT clauses for exploratory queries
3. **Index Awareness**: Consider index usage in WHERE and JOIN clauses
4. **SELECT Specific Columns**: Avoid SELECT * in production queries

### Security
1. **Use SELECT-Only Mode**: Enable for production databases
2. **Regular Schema Refresh**: Keep schema cache updated
3. **Monitor Query Complexity**: Review blocked queries for optimization
4. **SSH Tunnel Best Practices**: Use key-based authentication

### Performance
1. **Batch Related Queries**: Use batch execution for multiple queries
2. **Connection Reuse**: Let the system manage connection pooling
3. **Schema Caching**: Refresh schema only when needed
4. **Query Analysis**: Use performance analysis for slow queries

---

This reference provides comprehensive coverage of all available MCP tools. For additional examples and use cases, see the [tutorials](../tutorials/) section.