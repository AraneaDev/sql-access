# Configuration Guide

This comprehensive guide covers all configuration options for the SQL MCP Server, from basic setup to advanced enterprise deployments.

## 📋 Table of Contents

- [Configuration Overview](#configuration-overview)
- [Database Configuration](#database-configuration)
- [Security Configuration](#security-configuration)
- [Extension Configuration](#extension-configuration)
- [SSH Tunnel Configuration](#ssh-tunnel-configuration)
- [Configuration Examples](#configuration-examples)
- [Configuration Validation](#configuration-validation)
- [Environment Variables](#environment-variables)
- [Advanced Configuration](#advanced-configuration)

---

## 🔧 Configuration Overview

### Configuration File Location
The SQL MCP Server uses an INI-format configuration file:
- **Default location**: `./config.ini`
- **Custom location**: Specify via command line or environment variable

### Configuration Structure
```ini
# Database connections
[database.name1]
type=postgresql
host=localhost
# ... database-specific options

[database.name2] 
type=mysql
host=mysql.example.com
# ... database-specific options

# Global security settings
[security]
max_joins=10
max_complexity_score=100
# ... security options

# Server extension settings
[extension]
max_rows=1000
query_timeout=30000
# ... operational options
```

### Configuration Hierarchy
Settings are resolved in this order (highest priority first):
1. Command line arguments
2. Environment variables
3. Configuration file
4. Default values

---

## 🗄️ Database Configuration

### Basic Database Section
Each database requires its own section with the naming pattern `[database.name]`:

```ini
[database.mydb]
type=postgresql  # Required: Database type
host=localhost   # Required: Database host (except SQLite)
```

### Supported Database Types
- `postgresql` / `postgres`
- `mysql` 
- `sqlite`
- `mssql` / `sqlserver`

### Common Database Parameters

#### Required Parameters
| Parameter | Description | Example |
|-----------|-------------|---------|
| `type` | Database type | `postgresql` |
| `select_only` | Restrict to SELECT queries | `true` |

#### Connection Parameters
| Parameter | Default | Description | Example |
|-----------|---------|-------------|---------|
| `host` | - | Database hostname | `db.example.com` |
| `port` | *varies* | Database port | `5432` |
| `database` | - | Database name | `myapp` |
| `username` | - | Username | `readonly_user` |
| `password` | - | Password | `secure_password` |

#### Connection Options
| Parameter | Default | Description | Example |
|-----------|---------|-------------|---------|
| `ssl` | `false` | Enable SSL/TLS | `true` |
| `timeout` | `30000` | Connection timeout (ms) | `15000` |

#### SQLite-Specific Parameters
| Parameter | Description | Example |
|-----------|-------------|---------|
| `file` | SQLite file path | `./data/mydb.sqlite` |

### Default Port Numbers
- **PostgreSQL**: 5432
- **MySQL**: 3306  
- **SQL Server**: 1433
- **SQLite**: N/A (file-based)

---

## 🛡️ Security Configuration

### Security Section
Global security settings apply to all databases:

```ini
[security]
max_joins=10
max_subqueries=5
max_unions=3
max_group_bys=5
max_complexity_score=100
max_query_length=10000
```

### Security Parameters

#### Query Complexity Limits
| Parameter | Default | Description | Range |
|-----------|---------|-------------|-------|
| `max_joins` | `10` | Maximum JOIN operations | 1-100 |
| `max_subqueries` | `5` | Maximum subqueries | 1-50 |
| `max_unions` | `3` | Maximum UNION operations | 1-20 |
| `max_group_bys` | `5` | Maximum GROUP BY clauses | 1-50 |
| `max_complexity_score` | `100` | Overall complexity limit | 10-1000 |
| `max_query_length` | `10000` | Maximum query characters | 100-100000 |

#### SELECT-Only Mode
Configure per database:
```ini
[database.production]
type=postgresql
host=prod-db.com
select_only=true  # Recommended for production

[database.development] 
type=postgresql
host=dev-db.com
select_only=false  # Allow writes in development
```

---

## ⚙️ Extension Configuration

### Extension Section
Server operational settings:

```ini
[extension]
max_rows=1000
max_batch_size=10
query_timeout=30000
```

### Extension Parameters

#### Result Management
| Parameter | Default | Description | Range |
|-----------|---------|-------------|-------|
| `max_rows` | `1000` | Maximum rows per query | 1-100000 |
| `max_batch_size` | `10` | Maximum queries per batch | 1-100 |
| `query_timeout` | `30000` | Query timeout (ms) | 1000-600000 |

#### Performance Settings
| Parameter | Default | Description |
|-----------|---------|-------------|
| `connection_pool_size` | `5` | Connections per database |
| `schema_cache_ttl` | `3600` | Schema cache lifetime (seconds) |
| `log_level` | `INFO` | Logging verbosity |

---

## 🔐 SSH Tunnel Configuration

### SSH Parameters per Database
Add SSH tunnel settings to any database configuration:

```ini
[database.remote_db]
type=postgresql
host=internal-db.company.local  # Internal database host
port=5432
database=production
username=readonly_user
password=db_password

# SSH Tunnel Configuration
ssh_host=bastion.company.com     # SSH bastion host
ssh_port=22                      # SSH port
ssh_username=tunnel_user         # SSH username
ssh_private_key=/path/to/key     # SSH private key path
ssh_passphrase=key_passphrase    # SSH key passphrase (if encrypted)
```

### SSH Authentication Methods

#### Private Key Authentication (Recommended)
```ini
ssh_host=bastion.example.com
ssh_username=service_user
ssh_private_key=/secure/path/to/ssh_key
ssh_passphrase=optional_passphrase
```

#### Password Authentication
```ini
ssh_host=bastion.example.com  
ssh_username=tunnel_user
ssh_password=ssh_password
```

### SSH Key Management
```bash
# Generate SSH key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/sql_mcp_key

# Set proper permissions
chmod 600 ~/.ssh/sql_mcp_key
chmod 644 ~/.ssh/sql_mcp_key.pub

# Copy to bastion host
ssh-copy-id -i ~/.ssh/sql_mcp_key.pub user@bastion.host.com
```

---

## 💡 Configuration Examples

### Local Development Setup
```ini
[database.development]
type=sqlite
file=./dev.sqlite
select_only=false

[database.test_postgres] 
type=postgresql
host=localhost
port=5432
database=test_db
username=test_user
password=test_password
ssl=false
select_only=false

[security]
# Relaxed limits for development
max_joins=20
max_complexity_score=200

[extension]
max_rows=5000
query_timeout=60000
```

### Production Environment
```ini
[database.production_read]
type=postgresql
host=prod-replica.company.com
port=5432
database=production
username=readonly_service
password=complex_secure_password
ssl=true
select_only=true
timeout=15000

[database.analytics]
type=postgresql  
host=analytics-db.company.com
port=5432
database=data_warehouse
username=analytics_user
password=analytics_password
ssl=true
select_only=true

[security]
# Strict production limits
max_joins=5
max_subqueries=3
max_complexity_score=50
max_query_length=5000

[extension]
max_rows=1000
max_batch_size=5
query_timeout=30000
```

### Multi-Database Analytics
```ini
[database.transactions]
type=postgresql
host=txn-db.company.com
database=transactions
username=analytics_readonly
password=txn_password
ssl=true
select_only=true

[database.users]
type=mysql
host=user-db.company.com  
database=users
username=analytics_readonly
password=user_password
ssl=true
select_only=true

[database.events]
type=postgresql
host=events-db.company.com
database=events
username=analytics_readonly  
password=events_password
ssl=true
select_only=true

[database.local_cache]
type=sqlite
file=./cache/analytics.sqlite
select_only=false

[extension]
max_rows=2000
max_batch_size=15
```

### SSH Tunnel Setup
```ini
[database.secure_production]
type=postgresql
host=10.0.1.100            # Internal database IP
port=5432
database=production
username=readonly_user
password=db_password
ssl=true
select_only=true

# SSH tunnel through bastion
ssh_host=bastion.company.com
ssh_port=22
ssh_username=service_account
ssh_private_key=/etc/sql-mcp/keys/production.key

[database.multi_hop]
type=mysql
host=192.168.1.50          # Database behind multiple firewalls  
port=3306
database=internal_app
username=readonly_user
password=mysql_password

# Multi-hop SSH tunnel
ssh_host=external-bastion.company.com
ssh_port=2222
ssh_username=tunnel_service
ssh_private_key=/secure/keys/multi_hop.key
ssh_passphrase=key_encryption_password
```

---

## ✅ Configuration Validation

### Interactive Setup Wizard
Use the built-in wizard for guided configuration:

```bash
# Start configuration wizard
sql-mcp-setup

# Follow prompts:
? Select database type: PostgreSQL
? Database host: db.example.com
? Database port: 5432
? Database name: myapp
? Username: readonly_user
? Password: [hidden]
? Enable SSL? Yes
? SELECT-only mode? Yes (recommended)
? Configure SSH tunnel? Yes
? SSH host: bastion.example.com
```

### Manual Configuration Validation

#### Check Configuration Syntax
```bash
# Validate configuration file
node -e "console.log(require('ini').parse(require('fs').readFileSync('config.ini', 'utf8')))"
```

#### Test Database Connections
Use the connection test tool:

```typescript
// Test all configured databases
await server.testConnection('production');
await server.testConnection('analytics');
```

### Common Validation Errors

#### Missing Required Fields
```
❌ Database 'mydb' missing required field 'type'
❌ PostgreSQL database 'prod' missing required field 'host'
❌ SQLite database 'cache' missing required field 'file'
```

#### Invalid Configuration Values
```
❌ Invalid database type 'postgress' (did you mean 'postgresql'?)
❌ Invalid port '5432abc' - must be a number
❌ Security limit 'max_joins' must be between 1 and 100
```

---

## 🌍 Environment Variables

### Override Configuration with Environment Variables

#### Database Configuration
```bash
# Override database host
export SQL_MCP_DATABASE_PRODUCTION_HOST=new-host.example.com

# Override database password (recommended for security)
export SQL_MCP_DATABASE_PRODUCTION_PASSWORD=secure_password

# Override SSH configuration
export SQL_MCP_DATABASE_PRODUCTION_SSH_HOST=new-bastion.example.com
```

#### Global Configuration
```bash
# Override security settings
export SQL_MCP_SECURITY_MAX_JOINS=15
export SQL_MCP_SECURITY_MAX_COMPLEXITY_SCORE=150

# Override extension settings  
export SQL_MCP_EXTENSION_MAX_ROWS=2000
export SQL_MCP_EXTENSION_QUERY_TIMEOUT=45000
```

### Environment Variable Naming Convention
- Prefix: `SQL_MCP_`
- Section: `DATABASE_<name>_` or `SECURITY_` or `EXTENSION_`
- Parameter: `<PARAMETER_NAME>` (uppercase)

Examples:
- `SQL_MCP_DATABASE_PROD_HOST`
- `SQL_MCP_SECURITY_MAX_JOINS` 
- `SQL_MCP_EXTENSION_MAX_ROWS`

### Docker Environment Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine
COPY . /app
WORKDIR /app

# Set configuration via environment
ENV SQL_MCP_DATABASE_PRODUCTION_HOST=db.production.local
ENV SQL_MCP_DATABASE_PRODUCTION_PASSWORD_FILE=/run/secrets/db_password
ENV SQL_MCP_SECURITY_MAX_JOINS=5
ENV SQL_MCP_EXTENSION_MAX_ROWS=1000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  sql-mcp-server:
    image: sql-mcp-server
    environment:
      - SQL_MCP_DATABASE_APP_HOST=postgres
      - SQL_MCP_DATABASE_APP_PASSWORD=docker_password
    depends_on:
      - postgres
      
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: docker_password
```

---

## 🔧 Advanced Configuration

### Configuration Templates

#### Template System
Create reusable configuration templates:

```ini
# templates/base.ini
[security]
max_joins=10
max_complexity_score=100

[extension] 
max_rows=1000
query_timeout=30000

# templates/production.ini  
[security]
max_joins=5
max_complexity_score=50

[extension]
max_rows=500
query_timeout=15000
```

#### Configuration Inheritance
```bash
# Merge template with specific configuration
sql-mcp-server --config-template=templates/production.ini --config=config/prod.ini
```

### Dynamic Configuration

#### Configuration Reload
```bash
# Send SIGHUP to reload configuration
kill -HUP <server_pid>

# Or use management API (if enabled)
curl -X POST http://localhost:3000/admin/reload-config
```

#### Hot Configuration Updates
```typescript
// Update security limits at runtime
await server.updateSecurityConfig({
  max_joins: 15,
  max_complexity_score: 150
});
```

### Configuration Encryption

#### Encrypt Sensitive Values
```bash
# Encrypt password using server key
sql-mcp-encrypt --value="sensitive_password" --key-file=/secure/master.key

# Use encrypted value in configuration
password=encrypted:AES256:AbCd1234...
```

#### Key Management
```ini
[encryption]
key_file=/secure/encryption.key
key_rotation_days=90
```

### Configuration Profiles

#### Profile-Based Configuration
```ini
# Default profile
[database.main]
type=postgresql
host=localhost

# Development profile override
[profile.development.database.main]
host=dev-db.company.com
select_only=false

# Production profile override  
[profile.production.database.main]
host=prod-db.company.com
select_only=true
ssl=true
```

```bash
# Run with specific profile
sql-mcp-server --profile=production
```

### Monitoring Configuration

#### Configuration Metrics
```ini
[monitoring]
config_validation_metrics=true
connection_pool_metrics=true
query_performance_metrics=true

[monitoring.export]
prometheus_endpoint=true
statsd_host=localhost:8125
log_metrics=true
```

#### Configuration Auditing
```ini
[audit]
log_config_changes=true
config_change_webhook=https://audit.company.com/webhook
retain_config_history=30
```

---

## 🔍 Configuration Troubleshooting

### Common Issues and Solutions

#### Configuration File Not Found
```
❌ Error: No config.ini found
```
**Solutions:**
1. Create configuration file: `touch config.ini`
2. Run setup wizard: `sql-mcp-setup`
3. Specify custom path: `--config=/path/to/config.ini`

#### Permission Denied Reading Configuration
```
❌ Error: EACCES: permission denied, open 'config.ini'
```
**Solutions:**
1. Fix file permissions: `chmod 644 config.ini`
2. Check directory permissions
3. Run as appropriate user

#### Invalid Configuration Syntax
```  
❌ Error: Invalid INI syntax at line 15
```
**Solutions:**
1. Validate INI syntax
2. Check for missing quotes around special characters
3. Ensure proper section headers `[section.name]`

#### Database Connection Failed
```
❌ Error: Connection failed to database 'production'
```
**Solutions:**
1. Verify all required parameters are provided
2. Test database connectivity manually
3. Check firewall and network settings
4. Validate credentials

### Configuration Validation Tools

#### Built-in Validation
```bash
# Validate configuration
sql-mcp-server --validate-config

# Test specific database
sql-mcp-server --test-database=production
```

#### External Validation
```bash
# Use external INI validator
npm install -g ini-validator
ini-validator config.ini

# JSON schema validation
npm install -g ajv-cli
ajv validate -s config-schema.json -d config.json
```

This comprehensive configuration guide provides all the information needed to properly configure the SQL MCP Server for any environment, from local development to enterprise production deployments.