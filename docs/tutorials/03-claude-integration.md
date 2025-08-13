# Claude Desktop Integration Tutorial

This tutorial shows you how to integrate the SQL MCP Server with Claude Desktop, enabling Claude to query your databases directly.

## Overview

Claude Desktop can connect to MCP (Model Context Protocol) servers to extend Claude's capabilities. The SQL MCP Server acts as a bridge between Claude and your databases, allowing Claude to:

- Query your databases safely with built-in security validation
- Analyze data and generate insights
- Create reports and visualizations
- Help with database administration tasks

## Prerequisites

Before starting this tutorial, ensure you have:

- ✅ **SQL MCP Server installed** - [Installation Tutorial](01-installation.md)
- ✅ **Database configured** - At least one database connection configured
- ✅ **Claude Desktop installed** - Download from [claude.ai](https://claude.ai/desktop)
- ✅ **Server tested** - Verified that `sql-server` starts without errors

## Step 1: Verify SQL MCP Server

First, ensure your SQL MCP Server is properly configured:

### Check Configuration

```bash
# Verify configuration file exists
ls -la config.ini

# Test server startup
sql-server --test
```

**Expected Output:**
```
🚀 SQL MCP Server starting...
📊 Loaded 1 database configuration(s):
   • production (postgresql, SELECT-only)
🔒 Security manager initialized with default limits
✅ All systems ready
```

### Test Database Connections

```bash
# Test all configured databases
sql-setup --test-only
```

**Expected Output:**
```
--- Testing Connections ---
Testing production...
✅ Connected
   Schema captured: 23 tables, 156 columns
   Access mode: SELECT-only

Testing analytics...
✅ Connected
   Schema captured: 8 tables, 67 columns
   Access mode: SELECT-only
```

If you see connection errors, resolve them before proceeding to Claude Desktop integration.

## Step 2: Locate Claude Desktop Configuration

Claude Desktop stores its configuration in different locations depending on your operating system:

### Configuration File Locations

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Create Configuration Directory

If the configuration file doesn't exist, create it:

```bash
# macOS
mkdir -p ~/Library/Application\ Support/Claude
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
mkdir -p ~/.config/Claude
touch ~/.config/Claude/claude_desktop_config.json

# Windows (PowerShell)
New-Item -Path "$env:APPDATA\Claude" -ItemType Directory -Force
New-Item -Path "$env:APPDATA\Claude\claude_desktop_config.json" -ItemType File
```

## Step 3: Configure Claude Desktop

### Basic Configuration

Edit the Claude Desktop configuration file and add the SQL MCP Server:

```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": []
    }
  }
}
```

### Configuration with Custom Config Path

If your `config.ini` is in a non-standard location:

```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": ["--config", "/path/to/your/config.ini"]
    }
  }
}
```

### Configuration for Local Installation

If you installed the SQL MCP Server locally (not globally):

```json
{
  "mcpServers": {
    "sql-database": {
      "command": "npx",
      "args": ["sql-server"]
    }
  }
}
```

### Configuration with Environment Variables

To pass environment variables (like passwords):

```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": [],
      "env": {
        "DB_PASSWORD": "your_secure_password",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Advanced Configuration Example

```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": [
        "--config", "/etc/claude-sql/config.ini",
        "--debug"
      ],
      "env": {
        "DB_PROD_PASSWORD": "prod_password",
        "DB_ANALYTICS_PASSWORD": "analytics_password",
        "SSH_KEY_PASSPHRASE": "ssh_passphrase"
      }
    }
  }
}
```

## Step 4: Restart Claude Desktop

After updating the configuration:

1. **Close Claude Desktop completely**
2. **Wait 5 seconds** for all processes to terminate
3. **Restart Claude Desktop**

### Verify Configuration Load

When Claude Desktop starts, it should load the MCP server. You can verify this by:

1. Opening Claude Desktop
2. Starting a new conversation
3. Looking for available tools or functions

## Step 5: Test Integration

### Basic Connection Test

Start a conversation with Claude and ask:

```
Are you connected to any databases? Can you list the available databases?
```

**Expected Response:**
```
Yes! I can see that I'm connected to your SQL databases through the MCP server. Let me list the available databases for you.

I have access to the following databases:
• production (PostgreSQL, SELECT-only mode)
• analytics (MySQL, SELECT-only mode)

These databases are configured with security restrictions that allow only SELECT, WITH, SHOW, EXPLAIN, and DESCRIBE operations to ensure safe read-only access.

Would you like me to explore the schema of any of these databases or help you with a specific query?
```

### Schema Exploration Test

Ask Claude to explore your database structure:

```
Can you show me the tables in the production database?
```

**Expected Response:**
```
I'll explore the schema of your production database for you.

Here are the tables in your production database:

**User Management:**
• users (id, name, email, created_at, updated_at)
• user_profiles (user_id, bio, avatar_url, settings)
• user_sessions (id, user_id, token, expires_at)

**Content:**
• posts (id, user_id, title, content, published_at)
• comments (id, post_id, user_id, content, created_at)
• categories (id, name, description, slug)

**Analytics:**
• page_views (id, page_url, visitor_id, viewed_at)
• user_actions (id, user_id, action_type, metadata)

**System:**
• migrations (version, applied_at)
• settings (key, value, updated_at)

The database has a total of 23 tables with 156 columns. Would you like me to explore any specific table in more detail or help you with a particular query?
```

### Query Test

Test Claude's ability to run queries:

```
Show me the top 5 most active users by post count
```

**Expected Response:**
```
I'll query your database to find the most active users by post count.

Here are the top 5 most active users:

| Rank | User Name | Email | Post Count | Latest Post |
|------|-----------|-------|------------|-------------|
| 1 | Sarah Johnson | sarah@example.com | 42 | 2024-08-10 |
| 2 | Mike Chen | mike.chen@example.com | 38 | 2024-08-12 |
| 3 | Alex Rodriguez | alex.r@example.com | 35 | 2024-08-09 |
| 4 | Emily Davis | emily.davis@example.com | 31 | 2024-08-11 |
| 5 | John Smith | john.smith@example.com | 28 | 2024-08-08 |

This data shows that Sarah Johnson is your most prolific content creator with 42 posts, followed closely by Mike Chen. The activity levels suggest a healthy, engaged user base.

Would you like me to analyze posting patterns over time or explore other user engagement metrics?
```

## Troubleshooting Integration Issues

### Issue 1: MCP Server Not Found

**Symptoms:**
- Claude Desktop starts but doesn't recognize database tools
- No database-related capabilities available

**Solutions:**

1. **Verify command path:**
   ```bash
   # Test if command is in PATH
   which sql-server
   # or
   sql-server --version
   ```

2. **Use full path in configuration:**
   ```json
   {
     "mcpServers": {
       "sql-database": {
         "command": "/usr/local/bin/sql-server",
         "args": []
       }
     }
   }
   ```

3. **Check npm global installation:**
   ```bash
   npm list -g --depth=0 | grep sql-mcp-server
   ```

### Issue 2: Configuration File Not Found

**Symptoms:**
- Error messages about missing config.ini
- Server starts but no databases available

**Solutions:**

1. **Specify config path explicitly:**
   ```json
   {
     "mcpServers": {
       "sql-database": {
         "command": "sql-server",
         "args": ["--config", "/full/path/to/config.ini"]
       }
     }
   }
   ```

2. **Verify config file exists:**
   ```bash
   ls -la config.ini
   cat config.ini  # Check contents
   ```

### Issue 3: Database Connection Errors

**Symptoms:**
- MCP server loads but database queries fail
- Connection timeout or authentication errors

**Solutions:**

1. **Test connections independently:**
   ```bash
   sql-setup --test-only
   ```

2. **Check environment variables:**
   ```json
   {
     "mcpServers": {
       "sql-database": {
         "command": "sql-server",
         "args": [],
         "env": {
           "DB_PASSWORD": "correct_password"
         }
       }
     }
   }
   ```

3. **Enable debug mode:**
   ```json
   {
     "mcpServers": {
       "sql-database": {
         "command": "sql-server",
         "args": ["--debug"],
         "env": {
           "DEBUG": "sql-mcp:*"
         }
       }
     }
   }
   ```

### Issue 4: Permission Denied

**Symptoms:**
- "Permission denied" errors when starting MCP server
- Authentication failures

**Solutions:**

1. **Check file permissions:**
   ```bash
   chmod +x $(which sql-server)
   chmod 600 config.ini  # Protect sensitive config
   ```

2. **Verify user permissions:**
   ```bash
   # Test database connection manually
   psql -h localhost -U your_user -d your_database
   ```

### Issue 5: Claude Desktop Configuration Issues

**Symptoms:**
- Configuration changes don't take effect
- MCP server not loading

**Solutions:**

1. **Validate JSON syntax:**
   ```bash
   # Use a JSON validator
   cat claude_desktop_config.json | python -m json.tool
   ```

2. **Check file location:**
   ```bash
   # macOS
   ls -la ~/Library/Application\ Support/Claude/
   
   # Linux
   ls -la ~/.config/Claude/
   ```

3. **Completely restart Claude Desktop:**
   - Close all Claude Desktop windows
   - Wait 10 seconds
   - Check Task Manager/Activity Monitor for remaining processes
   - Kill any remaining Claude processes
   - Restart Claude Desktop

## Advanced Integration Configurations

### Multiple Database Servers

You can configure multiple MCP servers for different database environments:

```json
{
  "mcpServers": {
    "production-db": {
      "command": "sql-server",
      "args": ["--config", "/etc/sql-mcp/production.ini"]
    },
    "development-db": {
      "command": "sql-server",
      "args": ["--config", "/etc/sql-mcp/development.ini"]
    },
    "analytics-db": {
      "command": "sql-server",
      "args": ["--config", "/etc/sql-mcp/analytics.ini"]
    }
  }
}
```

### Configuration with SSH Tunnels

For databases requiring SSH tunnels:

```json
{
  "mcpServers": {
    "secure-database": {
      "command": "sql-server",
      "args": ["--config", "/secure/path/config.ini"],
      "env": {
        "SSH_PRIVATE_KEY": "/path/to/ssh/private/key",
        "SSH_PASSPHRASE": "optional_key_passphrase",
        "DB_PASSWORD": "database_password"
      }
    }
  }
}
```

### Development vs Production Configuration

**Development Configuration:**
```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": ["--debug"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "sql-mcp:*"
      }
    }
  }
}
```

**Production Configuration:**
```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": ["--config", "/etc/claude-sql/production.ini"],
      "env": {
        "NODE_ENV": "production",
        "DB_PASSWORD": "${DB_PASSWORD}",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

## Security Considerations

### Environment Variable Security

Never store sensitive data directly in the Claude Desktop configuration:

```json
// ❌ Bad: Passwords in config file
{
  "mcpServers": {
    "sql-database": {
      "env": {
        "DB_PASSWORD": "actual_password_here"
      }
    }
  }
}

// ✅ Good: Reference environment variables
{
  "mcpServers": {
    "sql-database": {
      "env": {
        "DB_PASSWORD": "${DB_PASSWORD}"
      }
    }
  }
}
```

### File Permissions

Protect your configuration files:

```bash
# Secure Claude Desktop config
chmod 600 ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Secure SQL MCP config
chmod 600 config.ini

# Secure SSH keys
chmod 600 ~/.ssh/your_private_key
```

### SELECT-Only Mode

Always use SELECT-only mode for databases accessed through Claude:

```ini
[database.production]
type=postgresql
# ... connection details ...
select_only=true  # Prevents INSERT/UPDATE/DELETE
```

## Usage Examples

### Data Analysis

Ask Claude to analyze your data:

```
Analyze user registration trends over the last 6 months. Show me monthly signup counts and identify any patterns.
```

### Business Intelligence

Get business insights:

```
Create a report showing our top-performing content categories by engagement metrics including views, comments, and user interactions.
```

### Database Administration

Get help with database tasks:

```
Check the database schema for any tables that might need indexing. Look for tables with many rows but no indexes on commonly queried columns.
```

### Performance Analysis

Analyze database performance:

```
Help me identify slow-running queries by analyzing the most complex queries in our application and suggesting optimizations.
```

## Next Steps

Now that Claude Desktop is integrated with your databases:

1. **Learn Query Techniques** → [Basic Queries Tutorial](04-basic-queries.md)
2. **Explore Advanced Features** → [Configuration Guide](../guides/configuration-guide.md)
3. **Review Security Settings** → [Security Guide](../guides/security-guide.md)
4. **Optimize Performance** → [Performance Tuning Guide](../operations/performance-tuning.md)

## Configuration Reference

### Complete Claude Desktop Configuration Example

```json
{
  "mcpServers": {
    "sql-database": {
      "command": "sql-server",
      "args": [
        "--config", "/etc/claude-sql/config.ini"
      ],
      "env": {
        "NODE_ENV": "production",
        "DB_PROD_PASSWORD": "${DB_PROD_PASSWORD}",
        "DB_ANALYTICS_PASSWORD": "${DB_ANALYTICS_PASSWORD}",
        "SSH_PRIVATE_KEY": "/secure/path/ssh_key",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production`, `development` |
| `DEBUG` | Debug output control | `sql-mcp:*` |
| `LOG_LEVEL` | Logging level | `info`, `warn`, `error` |
| `DB_PASSWORD` | Database password | `secure_password123` |
| `SSH_PRIVATE_KEY` | SSH key path | `/path/to/ssh/key` |
| `SSH_PASSPHRASE` | SSH key passphrase | `key_passphrase` |
| `CONFIG_PATH` | Custom config path | `/custom/path/config.ini` |

---

**🎉 Success!** Claude Desktop is now connected to your databases. Continue with the [Basic Queries Tutorial](04-basic-queries.md) to learn how to effectively use Claude for database operations.
