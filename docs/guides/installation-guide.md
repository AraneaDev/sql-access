# Installation Guide

This comprehensive guide walks you through installing the SQL MCP Server on various platforms and environments.

## System Requirements

### Minimum Requirements
- **Node.js**: 16.0.0 or higher
- **npm**: 8.0.0 or higher
- **Memory**: 256 MB RAM
- **Storage**: 100 MB available disk space
- **Network**: Internet access for package installation

### Recommended Requirements
- **Node.js**: 18.0.0 or higher (LTS)
- **npm**: 9.0.0 or higher
- **Memory**: 512 MB RAM
- **Storage**: 500 MB available disk space
- **Database Access**: Network connectivity to your databases

### Supported Platforms
- **Windows**: 10, 11, Server 2019, Server 2022
- **macOS**: 10.15 (Catalina) or later
- **Linux**: Ubuntu 18.04+, CentOS 7+, Debian 9+, RHEL 7+

## Quick Installation

### Option 0: Automatic Installer (Easiest)

```bash
# Install globally
npm install -g sql-access

# Run the automatic installer
sql-install

# The installer will:
# - Detect your platform (macOS/Windows/Linux)
# - Find Claude Code and Claude Desktop config files
# - Add sql-access as an MCP server automatically
# - Create a default config.ini if none exists
```

**Installer Options:**
```bash
sql-install --client=claude-code # Configure Claude Code only
sql-install --client=claude-desktop # Configure Claude Desktop only
sql-install --config=/path/to/config.ini # Use custom config path
sql-install --dry-run # Preview changes without modifying files
sql-install --uninstall # Remove sql-access from client configs
```

### Option 1: NPM Package (Recommended)

```bash
# Install globally
npm install -g sql-access

# Or install locally in a project
npm install sql-access

# Run setup
sql-setup
```

### Option 2: From Source

```bash
# Clone repository
git clone <repository-url>
cd sql-ts

# Install dependencies
npm install

# Build the project
npm run build

# Run setup
npm run setup
```

## Detailed Installation Steps

### Windows Installation

#### Prerequisites
1. **Install Node.js**
 - Download from [nodejs.org](https://nodejs.org/)
 - Choose LTS version (18.x recommended)
 - Run installer with default options

2. **Verify Installation**
 ```cmd
 node --version
 npm --version
 ```

#### Install SQL MCP Server
```cmd
# Open Command Prompt or PowerShell as Administrator
npm install -g sql-access

# Create project directory
mkdir C:\claude-sql-mcp
cd C:\claude-sql-mcp

# Run setup wizard
sql-setup
```

#### Windows-Specific Configuration
```ini
# Windows paths in config.ini
[database.local]
type=sqlite
file=C:\data\app.sqlite

# SSH key paths
ssh_private_key=C:\Users\username\.ssh\id_rsa
```

### macOS Installation

#### Prerequisites
1. **Install Node.js**
 ```bash
 # Using Homebrew (recommended)
 brew install node@18

 # Or download from nodejs.org
 ```

2. **Install Xcode Command Line Tools** (if building from source)
 ```bash
 xcode-select --install
 ```

#### Install SQL MCP Server
```bash
# Install globally
sudo npm install -g sql-access

# Create project directory
mkdir ~/claude-sql-mcp
cd ~/claude-sql-mcp

# Run setup
sql-setup
```

#### macOS-Specific Notes
- Configuration location: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Default SSH key location: `~/.ssh/id_rsa`

### Linux Installation

#### Ubuntu/Debian
```bash
# Update package index
sudo apt update

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools (if building from source)
sudo apt-get install -y build-essential

# Install SQL MCP Server
sudo npm install -g sql-access

# Create application directory
sudo mkdir -p /opt/claude-sql-mcp
sudo chown $USER:$USER /opt/claude-sql-mcp
cd /opt/claude-sql-mcp

# Run setup
sql-setup
```

#### CentOS/RHEL/Rocky Linux
```bash
# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install development tools (if building from source)
sudo dnf groupinstall -y "Development Tools"

# Install SQL MCP Server
sudo npm install -g sql-access

# Create application directory
sudo mkdir -p /opt/claude-sql-mcp
sudo chown $USER:$USER /opt/claude-sql-mcp
cd /opt/claude-sql-mcp

# Run setup
sql-setup
```

## Installation Directories

### Global Installation Structure
```
Global npm packages/
+-- sql-mcp-server/
    +-- dist/ # Compiled JavaScript
    +-- package.json # Package information
    +-- README.md # Documentation
```

### Local Project Structure
```
your-project/
+-- node_modules/
|   +-- sql-mcp-server/ # Package files
+-- config.ini # Your configuration
+-- package.json # Project dependencies
+-- sql-mcp-server.log # Log file (created at runtime)
```

## Configuration

### Initial Setup
After installation, run the setup wizard:

```bash
sql-setup
# or if installed locally:
npx sql-setup
```

> **Tip:** As an alternative to `sql-setup`, you can run `sql-install` which will automatically detect your platform, configure your MCP client (Claude Code or Claude Desktop), and create a default config.ini if none exists. See [Option 0: Automatic Installer](#option-0-automatic-installer-easiest) above.

The setup wizard will guide you through:

1. **Database Configuration**
 - Database type selection
 - Connection parameters
 - Security settings

2. **Extension Settings**
 - Query limits and timeouts
 - Performance tuning

3. **Security Configuration**
 - Query complexity limits
 - SELECT-only mode settings

### Manual Configuration
If you prefer manual configuration, copy and edit the template:

```bash
# Copy configuration template
cp node_modules/sql-mcp-server/config.ini.template config.ini

# Edit configuration
nano config.ini # Linux/macOS
notepad config.ini # Windows
```

## Database Drivers

The server includes drivers for all supported databases:

### Included Database Drivers
- **PostgreSQL**: `pg` (node-postgres)
- **MySQL**: `mysql2`
- **SQLite**: `sqlite3`
- **SQL Server**: `mssql`
- **SSH Tunneling**: `ssh2`

### Verify Driver Installation
```bash
# Check if all drivers are available
node -e "
const drivers = ['pg', 'mysql2', 'sqlite3', 'mssql', 'ssh2'];
drivers.forEach(driver => {
 try {
 require(driver);
 console.log('', driver);
 } catch (e) {
 console.log('', driver);
 }
});
"
```

## Verify Installation

### Test Server Startup
```bash
# Start the server
sql-mcp-start
# or if installed locally:
npx sql-mcp-start

# Expected output:
# SQL MCP Server running on stdio
# Server ready for Claude Desktop integration
```

### Test Database Connection
```bash
# Run connection test
sql-mcp-test
# or if installed locally:
npx sql-mcp-test

# Expected output for successful connection:
# Connection successful to database_name
# Schema captured: X tables, Y columns
```

### Test Claude Desktop Integration
1. Configure Claude Desktop with the server path
2. Restart Claude Desktop
3. Ask Claude: "List my available databases"
4. Expected: Claude shows your configured databases

## Docker Installation

### Using Pre-built Image
```bash
# Pull the official image
docker pull sql-mcp-server:latest

# Run with volume for configuration
docker run -it --rm \
 -v $(pwd)/config.ini:/app/config.ini \
 -v $(pwd)/logs:/app/logs \
 sql-mcp-server:latest
```

### Build from Source
```bash
# Clone repository
git clone <repository-url>
cd sql-ts

# Build Docker image
docker build -t sql-mcp-server .

# Run container
docker run -it --rm \
 -v $(pwd)/config.ini:/app/config.ini \
 sql-mcp-server
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
 sql-mcp-server:
 image: sql-mcp-server:latest
 volumes:
 - ./config.ini:/app/config.ini:ro
 - ./logs:/app/logs
 environment:
 - NODE_ENV=production
 - SQL_LOG_LEVEL=info
 restart: unless-stopped
```

## Enterprise Installation

### System Service Installation

#### Linux (systemd)
```bash
# Create service user
sudo useradd -r -s /bin/false sql-mcp-server

# Create service directory
sudo mkdir -p /opt/sql-mcp-server
sudo chown sql-mcp-server:sql-mcp-server /opt/sql-mcp-server

# Install service files
sudo cp sql-mcp-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sql-mcp-server
sudo systemctl start sql-mcp-server
```

#### Windows Service
```cmd
# Install as Windows Service using node-windows
npm install -g node-windows

# Create service installer script
node install-service.js

# Start service
net start "SQL MCP Server"
```

### Load Balancer Configuration
```nginx
# nginx configuration for multiple instances
upstream sql_mcp_servers {
 server 127.0.0.1:3001;
 server 127.0.0.1:3002;
 server 127.0.0.1:3003;
}

server {
 listen 80;
 server_name sql-mcp.company.com;

 location / {
 proxy_pass http://sql_mcp_servers;
 proxy_http_version 1.1;
 proxy_set_header Upgrade $http_upgrade;
 proxy_set_header Connection 'upgrade';
 proxy_cache_bypass $http_upgrade;
 }
}
```

## Development Installation

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd sql-ts

# Install dependencies
npm install

# Install development tools
npm install -g typescript nodemon

# Build in watch mode
npm run dev

# Run tests
npm test
```

### Development Dependencies
```bash
# TypeScript and build tools
npm install -D typescript @types/node ts-node nodemon

# Testing framework
npm install -D jest @types/jest ts-jest supertest

# Linting and formatting
npm install -D eslint @typescript-eslint/eslint-plugin prettier

# Database testing tools
npm install -D @testcontainers/postgresql @testcontainers/mysql
```

## Updating

### Update NPM Package
```bash
# Check current version
sql-mcp-server --version

# Update to latest version
npm update -g sql-mcp-server

# Verify update
sql-mcp-server --version
```

> **Tip:** After updating, you can re-run `sql-install` to ensure your MCP client configurations (Claude Code, Claude Desktop) are up to date with the latest server path and settings.

### Update from Source
```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm install

# Rebuild
npm run build

# Test installation
npm test
```

### Migration Between Versions
```bash
# Backup current configuration
cp config.ini config.ini.backup

# Update installation
npm update -g sql-mcp-server

# Check for configuration changes
sql-mcp-migrate-config --check

# Apply configuration migration if needed
sql-mcp-migrate-config --apply
```

## Command Reference

| Command | Description |
|---------|-------------|
| `sql-install` | Automatic installer -- detects platform, configures MCP clients, creates default config |
| `sql-setup` | Interactive setup wizard for database configuration |
| `sql-server` | Start the MCP server |
| `sql-mcp-start` | Start the MCP server (alias) |
| `sql-mcp-test` | Test database connections |

## Troubleshooting Installation

### Common Issues

#### Node.js Version Issues
```bash
# Check Node.js version
node --version

# If version is too old:
# - Windows: Download from nodejs.org
# - macOS: brew install node@18
# - Linux: Use NodeSource repository
```

#### Permission Issues (Linux/macOS)
```bash
# Fix npm global permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile
```

#### Build Failures
```bash
# Install build tools
# Windows: npm install -g windows-build-tools
# macOS: xcode-select --install
# Linux: sudo apt install build-essential

# Clear npm cache
npm cache clean --force

# Reinstall with verbose output
npm install -g sql-access --verbose
```

#### Database Driver Issues
```bash
# Rebuild native modules
npm rebuild

# For SQLite issues on Linux:
sudo apt-get install sqlite3 libsqlite3-dev

# For PostgreSQL issues:
sudo apt-get install libpq-dev
```

### Installation Verification Script
```bash
#!/bin/bash
# verify-installation.sh

echo " Verifying SQL MCP Server Installation..."

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
echo "Node.js version: $NODE_VERSION"
if [ "$(printf '%s\n' "16.0.0" "$NODE_VERSION" | sort -V | head -n1)" = "16.0.0" ]; then
 echo " Node.js version is sufficient"
else
 echo " Node.js version is too old (need 16.0.0+)"
 exit 1
fi

# Check npm version
NPM_VERSION=$(npm --version)
echo "npm version: $NPM_VERSION"

# Check if sql-mcp-server is installed
if command -v sql-mcp-server &> /dev/null; then
 echo " sql-mcp-server command is available"
 sql-mcp-server --version
else
 echo " sql-mcp-server command not found"
 exit 1
fi

# Check database drivers
echo "Checking database drivers..."
node -e "
const drivers = ['pg', 'mysql2', 'sqlite3', 'mssql', 'ssh2'];
drivers.forEach(driver => {
 try {
 require(driver);
 console.log(' ' + driver);
 } catch (e) {
 console.log(' ' + driver + ': ' + e.message);
 }
});
"

echo " Installation verification complete!"
```

## Next Steps

After successful installation:

1. **[Configure Your First Database](../tutorials/02-first-database.md)**
2. **[Set Up Claude Desktop Integration](../tutorials/03-claude-integration.md)**
3. **[Run Your First Query](../tutorials/04-basic-queries.md)**

For production deployments:
1. **[Security Hardening Guide](../operations/security-hardening.md)**
2. **[Deployment Guide](../operations/deployment-guide.md)**
3. **[Monitoring Setup](../operations/monitoring.md)**

---

**Need help?** Check the [troubleshooting guide](troubleshooting-guide.md) or ask in [GitHub Discussions](<repository-discussions-url>).