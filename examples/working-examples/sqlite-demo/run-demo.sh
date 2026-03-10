#!/bin/bash
# Complete automated SQLite demo script

set -e  # Exit on any error

echo "[START] Starting SQL MCP Server SQLite Demo"
echo "====================================="

# Check prerequisites
echo "1. Checking prerequisites..."
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js not found. Please install Node.js 16+"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "[ERROR] Node.js version $NODE_VERSION found. Please upgrade to Node.js 16+"
    exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[ERROR] SQLite3 not found. Please install SQLite3"
    exit 1
fi

echo "[OK] Prerequisites check passed"

# Setup demo database and configuration  
echo "2. Setting up demo database..."
./setup-demo.sh

# Start the server
echo "3. Starting SQL MCP Server..."
./start-server.sh

# Give server time to start
sleep 3

# Test the server
echo "4. Testing server functionality..."
./test-queries.sh

# Test Claude integration setup
echo "5. Testing Claude Desktop configuration..."
if [ -f "claude-config.json" ]; then
    echo "[OK] Claude Desktop config available"
    echo "   Copy to: ~/.config/Claude/claude_desktop_config.json"
    echo "   Update path: $(pwd)"
else
    echo "[ERROR] Claude Desktop config missing"
fi

# Cleanup
echo "6. Cleaning up..."
./stop-server.sh

echo ""
echo "[SUCCESS] Demo completed successfully!"
echo "================================"
echo ""
echo "[INFO] What was demonstrated:"
echo "  [OK] SQLite database with sample data"
echo "  [OK] SQL MCP Server configuration"
echo "  [OK] MCP protocol communication"
echo "  [OK] Query execution and results"
echo "  [OK] Error handling"
echo "  [OK] Claude Desktop integration setup"
echo ""
echo "[NEXT] Next steps:"
echo "  1. Try the PostgreSQL production example"
echo "  2. Configure Claude Desktop integration"
echo "  3. Explore the configuration options"
echo "  4. Read the documentation"
echo ""
echo "[DOCS] Documentation: https://github.com/your-org/sql-access/docs"
