# Contributing to SQL MCP Server

Thank you for your interest in contributing to the SQL MCP Server! This guide provides everything you need to know to contribute effectively to the project.

## 🎯 How to Contribute

There are many ways to contribute to this project:

- **🐛 Report bugs** - Help us identify and fix issues
- **💡 Suggest features** - Propose new functionality or improvements
- **📖 Improve documentation** - Help make our docs clearer and more comprehensive
- **🔧 Submit code** - Fix bugs, implement features, or optimize performance
- **🧪 Write tests** - Improve test coverage and reliability
- **🎨 Enhance UI/UX** - Improve the setup wizard and user experience

## 🚀 Getting Started

### Prerequisites

- **Node.js 16+** and **npm 8+**
- **Git** for version control
- **TypeScript** knowledge for code contributions
- Access to test databases (PostgreSQL, MySQL, SQLite, SQL Server)

### Development Setup

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd sql-ts
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   # Development build with watch mode
   npm run dev
   
   # Or one-time build
   npm run build
   ```

4. **Set Up Test Environment**
   ```bash
   # Copy configuration template
   cp config.ini.template config.ini
   
   # Edit config.ini with your test database credentials
   # Use test/development databases only!
   ```

5. **Run Tests**
   ```bash
   # Run all tests
   npm test
   
   # Run with coverage
   npm run test:coverage
   
   # Watch mode for development
   npm run test:watch
   ```

### Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-number-description
   ```

2. **Make your changes**
   - Write code following our [coding standards](#-coding-standards)
   - Add/update tests as needed
   - Update documentation if applicable

3. **Test your changes**
   ```bash
   # Run all tests
   npm test
   
   # Check TypeScript compilation
   npm run type-check
   
   # Run linting
   npm run lint
   
   # Test the build
   npm run build:production
   ```

4. **Commit your changes**
   ```bash
   # Stage your changes
   git add .
   
   # Commit with descriptive message
   git commit -m "feat: add support for Oracle database adapter
   
   - Implement OracleAdapter class with full CRUD operations
   - Add Oracle-specific schema capture logic
   - Include comprehensive test coverage
   - Update documentation with Oracle examples
   
   Closes #123"
   ```

5. **Push changes**
   ```bash
   git push origin feature/your-feature-name
   ```

## 📋 Development Guidelines

### Before Submitting Changes

- ✅ **Tests pass**: All existing and new tests must pass
- ✅ **Linting passes**: Code follows our style guidelines
- ✅ **TypeScript compiles**: No type errors
- ✅ **Documentation updated**: If you changed functionality

### Code Guidelines

1. **Clear Commit Messages**: Use conventional commits format
   - `feat: add new feature`
   - `fix: resolve issue with X`
   - `docs: update installation guide`
   - `test: add tests for Y`
   - `refactor: improve Z performance`

2. **Small, Focused Changes**: Keep changes focused on a single feature/fix

3. **Update Tests**: Include tests for new functionality

## 🏗️ Project Structure

Understanding the codebase structure will help you contribute more effectively:

```
src/
├── classes/              # Core service classes
│   ├── SQLMCPServer.ts      # Main MCP protocol handler
│   ├── ConnectionManager.ts  # Database connection management
│   ├── SecurityManager.ts    # Query security and validation
│   ├── SchemaManager.ts      # Database schema caching
│   └── SSHTunnelManager.ts   # SSH tunnel management
├── database/             # Database layer
│   └── adapters/         # Database-specific implementations
│       ├── base.ts          # Abstract adapter base class
│       ├── postgresql.ts    # PostgreSQL adapter
│       ├── mysql.ts         # MySQL adapter
│       ├── sqlite.ts        # SQLite adapter
│       └── mssql.ts         # SQL Server adapter
├── types/                # TypeScript type definitions
│   ├── config.ts           # Configuration types
│   ├── database.ts         # Database-related types
│   ├── mcp.ts              # MCP protocol types
│   ├── security.ts         # Security-related types
│   └── ssh.ts              # SSH tunnel types
├── utils/                # Utility functions
│   ├── config.ts           # Configuration parsing
│   ├── logger.ts           # Logging utilities
│   ├── error-handler.ts    # Error handling
│   └── query-formatter.ts  # Query formatting
├── setup/                # Interactive setup system
│   ├── wizard.ts           # Setup wizard
│   ├── validators.ts       # Configuration validation
│   └── config-generator.ts # Configuration generation
├── index.ts              # Server entry point
└── setup.ts              # Setup script entry point

tests/
├── fixtures/             # Test data and mocks
├── unit/                 # Unit tests
├── integration/          # Integration tests
└── setup.ts              # Test environment setup

docs/                     # Documentation
├── architecture/         # Architecture documentation
├── api/                  # API reference
├── guides/               # User guides
├── tutorials/            # Step-by-step tutorials
├── operations/           # Deployment and operations
└── development/          # Development documentation
```

## 🎨 Coding Standards

### TypeScript Guidelines

1. **Strict Type Safety**
   ```typescript
   // ✅ Good: Explicit types
   interface DatabaseConfig {
     host: string;
     port: number;
     ssl?: boolean;
   }
   
   function connect(config: DatabaseConfig): Promise<Connection> {
     // implementation
   }
   
   // ❌ Bad: Any types
   function connect(config: any): Promise<any> {
     // implementation
   }
   ```

2. **Use Interfaces for Contracts**
   ```typescript
   // ✅ Good: Clear interface definition
   interface DatabaseAdapter {
     connect(): Promise<DatabaseConnection>;
     executeQuery(query: string): Promise<QueryResult>;
     disconnect(): Promise<void>;
   }
   
   // ✅ Good: Implementation
   class PostgreSQLAdapter implements DatabaseAdapter {
     async connect(): Promise<Client> { /* ... */ }
     async executeQuery(query: string): Promise<QueryResult> { /* ... */ }
     async disconnect(): Promise<void> { /* ... */ }
   }
   ```

3. **Proper Error Handling**
   ```typescript
   // ✅ Good: Specific error types
   class ConnectionError extends Error {
     constructor(message: string, public details?: Record<string, unknown>) {
       super(message);
       this.name = 'ConnectionError';
     }
   }
   
   async function connect(): Promise<Connection> {
     try {
       return await database.connect();
     } catch (error) {
       throw new ConnectionError('Failed to connect', { 
         originalError: error.message 
       });
     }
   }
   ```

### Code Style

1. **Use ESLint Configuration**
   ```bash
   # Check and fix linting issues
   npm run lint
   
   # Check only (no fixes)
   npm run lint:check
   ```

2. **Naming Conventions**
   - **Classes**: PascalCase (`DatabaseAdapter`, `SecurityManager`)
   - **Functions/Variables**: camelCase (`executeQuery`, `connectionTimeout`)
   - **Constants**: UPPER_SNAKE_CASE (`MAX_CONNECTIONS`, `DEFAULT_TIMEOUT`)
   - **Files**: kebab-case (`database-adapter.ts`, `security-manager.ts`)

3. **Documentation**
   ```typescript
   /**
    * Execute a SQL query with security validation
    * @param query - The SQL query to execute
    * @param params - Optional parameters for prepared statements
    * @returns Promise resolving to query results
    * @throws {SecurityViolationError} When query violates security rules
    * @throws {ConnectionError} When database connection fails
    */
   async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
     // implementation
   }
   ```

### Testing Standards

1. **Comprehensive Test Coverage**
   ```typescript
   describe('SecurityManager', () => {
     let securityManager: SecurityManager;
     
     beforeEach(() => {
       securityManager = new SecurityManager();
     });
     
     describe('validateQuery', () => {
       it('should allow safe SELECT queries', () => {
         const result = securityManager.validateQuery('SELECT * FROM users');
         expect(result.allowed).toBe(true);
       });
       
       it('should block dangerous operations', () => {
         const result = securityManager.validateQuery('DROP TABLE users');
         expect(result.allowed).toBe(false);
         expect(result.reason).toContain('DROP');
       });
       
       it('should handle edge cases', () => {
         const result = securityManager.validateQuery('');
         expect(result.allowed).toBe(false);
       });
     });
   });
   ```

2. **Test Categories**
   - **Unit Tests**: Test individual functions/classes in isolation
   - **Integration Tests**: Test component interactions
   - **End-to-End Tests**: Test complete user workflows

3. **Mock External Dependencies**
   ```typescript
   jest.mock('../database/adapters/postgresql', () => ({
     PostgreSQLAdapter: jest.fn().mockImplementation(() => ({
       connect: jest.fn().mockResolvedValue(mockConnection),
       executeQuery: jest.fn().mockResolvedValue(mockResult)
     }))
   }));
   ```

## 🐛 Bug Reports

### How to Report a Bug

1. **Check existing documentation** first to see if it's a configuration issue
2. **Provide detailed information**:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details
   - Configuration (sanitized)
   - Logs/error messages

### Bug Report Format

When reporting bugs, include:

```markdown
**Bug Description**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure database with '...'
2. Run command '...'
3. Execute query '...'
4. See error

**Expected Behavior**
What you expected to happen.

**Actual Behavior**
What actually happened.

**Environment**
- OS: [e.g. macOS 12.0, Ubuntu 20.04]
- Node.js version: [e.g. 16.14.0]
- Server version: [e.g. 2.0.0]
- Database type: [e.g. PostgreSQL 13]

**Configuration**
```ini
# Remove sensitive information like passwords
[database.example]
type=postgresql
host=[REDACTED]
# ... other settings
```

**Logs/Error Messages**
```
Paste relevant logs here
```

**Additional Context**
Any other context about the problem.
```

## 💡 Feature Requests

### Proposing New Features

When suggesting features, provide:

- **Clear description** of the feature
- **Use cases and benefits**
- **Implementation considerations**
- **Potential drawbacks or concerns**

### Feature Request Format

```markdown
**Feature Description**
A clear description of the feature you'd like to see.

**Use Case**
Describe the problem this feature would solve or the workflow it would improve.

**Proposed Solution**
Describe how you envision this feature working.

**Alternative Solutions**
Describe any alternative approaches you've considered.

**Additional Context**
- Would this be a breaking change?
- Any implementation ideas?
- Related issues or discussions?
```

## 🔧 Adding Database Support

### New Database Adapter Checklist

To add support for a new database:

1. **Create Adapter Class**
   ```typescript
   // src/database/adapters/newdb.ts
   export class NewDatabaseAdapter extends DatabaseAdapter {
     // Implement all abstract methods
   }
   ```

2. **Update Factory**
   ```typescript
   // src/database/adapters/index.ts
   case 'newdatabase':
     return new NewDatabaseAdapter(config);
   ```

3. **Update Types**
   ```typescript
   // src/types/database.ts
   export type DatabaseTypeString = 'mysql' | 'postgresql' | 'sqlite' | 'mssql' | 'newdatabase';
   ```

4. **Add Configuration Support**
   ```typescript
   // src/utils/config.ts
   // Add validation and default port
   ```

5. **Write Comprehensive Tests**
   ```typescript
   // tests/unit/newdb-adapter.test.ts
   // tests/integration/newdb-integration.test.ts
   ```

6. **Update Documentation**
   - Configuration examples
   - Setup instructions
   - Troubleshooting guide

## 📖 Documentation Contributions

### Documentation Structure

- **Guides**: User-focused how-to documentation
- **Tutorials**: Step-by-step learning materials
- **API Reference**: Technical API documentation
- **Architecture**: System design and internals

### Writing Guidelines

1. **Clear and Concise**: Use simple language and short sentences
2. **Practical Examples**: Include code samples and real-world scenarios
3. **Progressive Disclosure**: Start simple, add complexity gradually
4. **Consistent Style**: Follow existing documentation patterns
5. **User-Focused**: Write from the user's perspective

### Documentation Checklist

- ✅ **Spelling and grammar** are correct
- ✅ **Code examples** are tested and work
- ✅ **Links** are valid and relevant
- ✅ **Screenshots** are current and helpful
- ✅ **Cross-references** to related content

## 🎯 Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

### Release Checklist

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with release notes
3. **Run full test suite** and ensure all tests pass
4. **Build and test** the release package
5. **Create release tag** and publish

## 🤝 Development Guidelines

### Code Quality

- **Be respectful** and constructive in code reviews
- **Write clear commit messages** that explain the "why"
- **Keep changes focused** on a single concern
- **Test your changes** thoroughly
- **Document your code** for future maintainers

### Best Practices

- **Follow existing patterns** in the codebase
- **Ask questions** if something is unclear
- **Consider backward compatibility** for public APIs
- **Update documentation** when changing behavior
- **Add tests** for new functionality

## 💭 Getting Help

### Development Questions

Check these resources when you need help:

- **Documentation**: Start with our comprehensive guides
- **Examples**: Look at the `examples/` directory for working configurations
- **Tests**: Examine existing tests to understand expected behavior
- **Code**: Read through similar implementations in the codebase

### Debugging Tips

When debugging issues:

1. **Check logs** for detailed error messages
2. **Use the test suite** to isolate problems
3. **Test with simple configurations** first
4. **Verify database connectivity** outside the application

## 🎉 Thank You!

Every contribution, whether it's a bug report, feature suggestion, code change, or documentation improvement, helps make this project better for everyone. We appreciate your time and effort in contributing to the SQL MCP Server!

---

**Ready to contribute?** Start by exploring the codebase and checking out our [development setup guide](development-setup.md)!
