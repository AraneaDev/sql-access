#!/bin/bash
# Complete automated SQLite demo script

set -e  # Exit on any error

echo "🚀 Starting SQL MCP Server SQLite Demo"
echo "====================================="

# Check prerequisites
echo "1. Checking prerequisites..."
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js not found. Please install Node.js 16+"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version $NODE_VERSION found. Please upgrade to Node.js 16+"
    exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "❌ SQLite3 not found. Please install SQLite3"
    exit 1
fi

echo "✅ Prerequisites check passed"

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
    echo "✅ Claude Desktop config available"
    echo "   Copy to: ~/.config/Claude/claude_desktop_config.json"
    echo "   Update path: $(pwd)"
else
    echo "❌ Claude Desktop config missing"
fi

# Cleanup
echo "6. Cleaning up..."
./stop-server.sh

echo ""
echo "🎉 Demo completed successfully!"
echo "================================"
echo ""
echo "📋 What was demonstrated:"
echo "  ✅ SQLite database with sample data"
echo "  ✅ SQL MCP Server configuration"
echo "  ✅ MCP protocol communication"
echo "  ✅ Query execution and results"
echo "  ✅ Error handling"
echo "  ✅ Claude Desktop integration setup"
echo ""
echo "🎯 Next steps:"
echo "  1. Try the PostgreSQL production example"
echo "  2. Configure Claude Desktop integration"
echo "  3. Explore the configuration options"
echo "  4. Read the documentation"
echo ""
echo "📖 Documentation: https://github.com/your-org/sql-access/docs"
