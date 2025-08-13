# Scripts Directory

This directory contains build and utility scripts for the SQL MCP Server project.

## Available Scripts

### 🔨 Build Script (`build.js`)

Production build script that compiles TypeScript and creates optimized distribution files.

**Usage:**
```bash
node scripts/build.js
```

Or via npm:
```bash
npm run build        # Standard TypeScript build
npm run build:fast   # Fast esbuild compilation
```

**Features:**
- TypeScript compilation with optimizations
- Bundle size analysis
- Source map generation
- Build validation and verification

### 🔍 Interactive Query Analyzer (`interactive-query-analyzer.js`)

Advanced query analysis tool with interactive features for testing and debugging SQL queries.

**Usage:**
```bash
node scripts/interactive-query-analyzer.js [options]
```

**Features:**
- Real-time query validation and security analysis
- Performance profiling and optimization suggestions  
- Interactive query testing environment
- Batch query analysis and reporting
- Database schema exploration

**Interactive Commands:**
```
.help              # Show available commands
.analyze [query]   # Analyze query complexity  
.security [query]  # Security scan
.optimize [query]  # Query optimization suggestions
.benchmark [query] # Performance benchmark simulation
.history          # Show query history
.clear            # Clear screen
.exit             # Exit analyzer
```

## Package.json Script Integration

These scripts are integrated into the main `package.json`:

```json
{
  "scripts": {
    "build": "npm run clean && tsc",
    "build:fast": "npm run clean && npm run build:esbuild", 
    "build:production": "npm run clean && npm run lint && npm run test && npm run build",
    "clean": "node -e \"const fs = require('fs'); if (fs.existsSync('dist')) fs.rmSync('dist', {recursive: true, force: true});\""
  }
}
```

## Development Notes

When modifying scripts:

1. **Follow Node.js best practices**
2. **Include proper error handling**
3. **Add help documentation**
4. **Test with various environments**
5. **Update this README** when adding new scripts

## Script Dependencies

Scripts may require additional development dependencies:
- TypeScript compiler API
- Build analysis tools
- Command-line argument parsing utilities

Check individual script files for specific requirements.
