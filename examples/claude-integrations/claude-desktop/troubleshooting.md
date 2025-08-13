# Claude Desktop Integration Troubleshooting

This guide helps resolve common issues when integrating SQL MCP Server with Claude Desktop.

## Quick Diagnostic Checklist

Before diving into detailed troubleshooting, run through this quick checklist:

- [ ] SQL MCP Server is built (`npm run build`)
- [ ] Valid `config.ini` exists in project root
- [ ] Claude Desktop config file exists and has correct paths
- [ ] Node.js is installed and accessible
- [ ] Database connections work independently
- [ ] Claude Desktop has been restarted after config changes

## Common Issues and Solutions

### 1. Server Not Appearing in Claude Desktop

**Symptoms:**
- Claude doesn't recognize SQL commands
- "I don't have access to databases" responses
- No MCP tools available

**Solutions:**

**Check Config File Location:**
```bash
# macOS
ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
dir %APPDATA%\Claude\claude_desktop_config.json

# Linux
ls -la ~/.config/Claude/claude_desktop_config.json
```

**Verify Config Syntax:**
```bash
# Validate JSON syntax
cat claude_desktop_config.json | python -m json.tool
# or
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('claude_desktop_config.json')), null, 2))"
```

**Check File Paths:**
```bash
# Verify the server file exists
ls -la /path/to/sql-mcp-server/dist/index.js

# Test Node.js execution
node /path/to/sql-mcp-server/dist/index.js --version
```

### 2. Database Connection Failures

**Symptoms:**
- "Failed to connect to database" errors
- Timeout errors when running queries
- Server starts but database operations fail

**Solutions:**

**Test Database Connection Independently:**
```bash
# Test with the MCP server directly
npm run test

# Or test individual connections
node -e "
const { loadConfiguration } = require('./dist/utils/config.js');
const config = loadConfiguration();
console.log('Config loaded:', Object.keys(config.databases));
"
```

**Verify Config.ini Settings:**
```ini
# Check your config.ini for common issues:

[database.example]
type=postgresql  # Make sure type is correct
host=localhost   # Verify host is accessible
port=5432       # Check port is not blocked
database=mydb   # Ensure database exists
username=user   # Verify user exists and has permissions
password=pass   # Check password is correct
ssl=false       # Try both true/false if having SSL issues
timeout=30000   # Increase if getting timeouts
```

**Test Network Connectivity:**
```bash
# Test basic connectivity
telnet your-db-host 5432

# For PostgreSQL
psql -h your-db-host -U your-username -d your-database -c "SELECT 1;"

# For MySQL
mysql -h your-db-host -u your-username -p -e "SELECT 1;"
```

### 3. Path and Permission Issues

**Symptoms:**
- "Command not found" errors
- Permission denied when starting server
- File not found errors

**Solutions:**

**Use Absolute Paths:**
```json
{
  "mcpServers": {
    "sql-mcp-server": {
      "command": "/usr/local/bin/node",
      "args": ["/full/absolute/path/to/sql-mcp-server/dist/index.js"],
      "env": {
        "CONFIG_PATH": "/full/absolute/path/to/config.ini"
      }
    }
  }
}
```

**Check Node.js Path:**
```bash
# Find Node.js location
which node
whereis node

# Test Node.js version
node --version
```

**Verify File Permissions:**
```bash
# Check file permissions
ls -la /path/to/sql-mcp-server/dist/index.js
ls -la /path/to/config.ini

# Fix permissions if needed
chmod +x /path/to/sql-mcp-server/dist/index.js
chmod 644 /path/to/config.ini
```

### 4. Performance and Timeout Issues

**Symptoms:**
- Slow query responses
- Timeout errors on complex queries
- Claude stops responding during database operations

**Solutions:**

**Increase Timeouts:**
```json
{
  "mcpServers": {
    "sql-mcp-server": {
      "command": "node",
      "args": ["/path/to/sql-mcp-server/dist/index.js"],
      "env": {
        "QUERY_TIMEOUT": "60000",
        "CONNECTION_TIMEOUT": "30000"
      }
    }
  }
}
```

**Optimize Config.ini:**
```ini
[extension]
max_rows=500          # Reduce if getting large result sets
query_timeout=45000   # Increase for complex queries
max_batch_size=5      # Reduce if running multiple queries

[security]
max_complexity_score=50  # Reduce if queries are too complex
```

**Monitor Resource Usage:**
```bash
# Check CPU and memory usage
top | grep node

# Monitor database connections
# PostgreSQL:
SELECT count(*) FROM pg_stat_activity WHERE datname = 'your_database';

# MySQL:
SHOW PROCESSLIST;
```

### 5. Security and Permission Errors

**Symptoms:**
- "Access denied" errors
- "Security violation" messages
- Queries work in database client but fail in Claude

**Solutions:**

**Review Database User Permissions:**
```sql
-- PostgreSQL: Check user permissions
SELECT * FROM information_schema.role_table_grants 
WHERE grantee = 'your_username';

-- MySQL: Check user permissions
SHOW GRANTS FOR 'your_username'@'your_host';
```

**Check SELECT-only Mode:**
```ini
# If you need full access, change this setting
[database.example]
select_only=false  # Change from true to false for full access
```

**Review Security Settings:**
```ini
[security]
max_joins=20           # Increase if complex joins are needed
max_subqueries=10      # Increase for complex queries
max_complexity_score=200  # Increase for complex operations
```

### 6. Logging and Debug Information

**Enable Debug Logging:**
```json
{
  "mcpServers": {
    "sql-mcp-server": {
      "command": "node",
      "args": ["/path/to/sql-mcp-server/dist/index.js"],
      "env": {
        "LOG_LEVEL": "debug",
        "DEBUG_QUERIES": "true",
        "NODE_ENV": "development"
      }
    }
  }
}
```

**Check Claude Desktop Logs:**
```bash
# macOS
tail -f ~/Library/Logs/Claude/claude.log

# Windows
# Check Event Viewer or application logs

# Linux
journalctl -f | grep -i claude
```

**Check MCP Server Logs:**
```bash
# If running with debug enabled, logs will show:
# - Server startup messages
# - Database connection attempts
# - Query executions
# - Error details
```

## Platform-Specific Issues

### macOS
- **Gatekeeper**: May block execution of the server
  ```bash
  xattr -d com.apple.quarantine /path/to/sql-mcp-server/dist/index.js
  ```
- **Permission**: Ensure Claude Desktop has necessary permissions

### Windows
- **Path Separators**: Use double backslashes in JSON strings
  ```json
  "args": ["C:\\Users\\name\\sql-mcp-server\\dist\\index.js"]
  ```
- **PowerShell Execution Policy**: May need to be adjusted
- **Antivirus**: May block Node.js execution

### Linux
- **AppArmor/SELinux**: May restrict file access
- **Snap/Flatpak**: Claude Desktop may have limited file system access
- **File Permissions**: Ensure proper execute permissions

## Advanced Troubleshooting

### Manual Server Testing
```bash
# Test the server directly
node /path/to/sql-mcp-server/dist/index.js

# Test with MCP client
npm install -g @modelcontextprotocol/inspector
mcp-inspector node /path/to/sql-mcp-server/dist/index.js
```

### Environment Variables Debug
```bash
# Test environment variable loading
node -e "
process.env.CONFIG_PATH = '/path/to/config.ini';
process.env.LOG_LEVEL = 'debug';
require('/path/to/sql-mcp-server/dist/index.js');
"
```

### Config Validation
```bash
# Validate configuration programmatically
node -e "
const { loadConfiguration, validateConfiguration } = require('/path/to/sql-mcp-server/dist/utils/config.js');
try {
  const config = loadConfiguration('/path/to/config.ini');
  validateConfiguration(config);
  console.log('Config is valid');
} catch (error) {
  console.error('Config error:', error.message);
}
"
```

## Getting Help

If you're still experiencing issues:

1. **Gather Information:**
   - Claude Desktop version
   - Operating system and version
   - Node.js version
   - SQL MCP Server version
   - Database type and version
   - Complete error messages

2. **Check Documentation:**
   - [Installation Guide](../../../docs/guides/installation-guide.md)
   - [Configuration Guide](../../../docs/guides/configuration-guide.md)
   - [Troubleshooting Guide](../../../docs/guides/troubleshooting-guide.md)

3. **Create a Minimal Reproduction:**
   - Use the simplest possible configuration
   - Test with SQLite first (no network dependencies)
   - Provide complete config files (with sensitive data redacted)

4. **Report Issues:**
   - Include all gathered information
   - Provide steps to reproduce
   - Share relevant log messages
   - Use the provided issue template

## Success Indicators

You'll know the integration is working when:
- Claude responds to: "What databases do you have access to?"
- Database schema queries return results
- Query execution works without errors
- Performance meets your expectations
- Security settings properly restrict access

## Maintenance Tips

- Regularly restart Claude Desktop (weekly)
- Monitor log file sizes and rotate as needed
- Update SQL MCP Server regularly
- Review and update security settings periodically
- Test backup and recovery procedures
- Document any custom configurations or workarounds