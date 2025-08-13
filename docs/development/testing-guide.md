# Testing Guide

This guide covers testing strategies, frameworks, and best practices for the SQL MCP Server project.

## Overview

The SQL MCP Server uses a comprehensive testing strategy with Jest as the primary testing framework, ensuring high-quality, reliable code through unit tests, integration tests, and automated testing workflows.

**Testing Stack:**
- **Jest** - Primary testing framework with TypeScript support
- **ts-jest** - TypeScript preset for Jest
- **Supertest** - HTTP assertion library for API testing
- **Custom matchers** - Domain-specific test assertions
- **Mock implementations** - Database and SSH connection mocking

## Quick Start

### Run All Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Run Specific Test Types

```bash
# Unit tests only
npm run test:unit

# Integration tests only  
npm run test:integration

# Verbose output for debugging
VERBOSE_TESTS=1 npm test
```

## Project Test Structure

```
tests/
├── setup.ts                    # Global test configuration
├── fixtures/                   # Test data and mock objects
│   ├── sample-queries.ts       # SQL query samples for testing
│   ├── mock-databases.ts       # Database connection mocks
│   └── test-configs.ts         # Configuration samples
├── unit/                       # Unit tests
│   ├── security-manager.test.ts
│   ├── connection-manager.test.ts
│   └── *.test.ts
└── integration/                # Integration tests
    ├── mcp-server.test.ts
    └── *.test.ts
```

## Testing Configuration

### Jest Configuration (`jest.config.json`)

```json
{
  "preset": "ts-jest/presets/default-esm",
  "extensionsToTreatAsEsm": [".ts"],
  "testEnvironment": "node",
  "roots": ["<rootDir>/tests"],
  "testMatch": ["**/tests/**/*.test.ts"],
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/setup/**/*",
    "!src/index.ts"
  ],
  "coverageDirectory": "coverage",
  "coverageReporters": ["text", "lcov", "html"],
  "setupFilesAfterEnv": ["<rootDir>/tests/setup.ts"]
}
```

### Global Test Setup (`tests/setup.ts`)

The global setup provides:
- **Console mocking** to reduce test noise
- **Test timeout configuration** (30 seconds)
- **Custom matchers** for SQL and MCP validation
- **Mock implementations** for external dependencies
- **Cleanup utilities** for test isolation

## Unit Testing

### Security Manager Tests

Test the SQL security validation system:

```typescript
import { SecurityManager } from '../../src/classes/SecurityManager.js';
import { SampleQueries } from '../fixtures/sample-queries.js';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    const config = {
      security: {
        max_joins: 10,
        max_subqueries: 5,
        max_unions: 3,
        max_group_bys: 5,
        max_complexity_score: 100,
        max_query_length: 10000
      }
    };
    securityManager = new SecurityManager(config);
  });

  test('should allow basic SELECT queries', async () => {
    const result = await securityManager.validateQuery(
      SampleQueries.basicQueries.simple
    );
    expect(result.allowed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  test('should block INSERT queries in SELECT-only mode', async () => {
    const result = await securityManager.validateQuery(
      SampleQueries.modificationQueries.insert
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedCommand).toBe('INSERT');
  });
});
```

### Connection Manager Tests

Test database connection management:

```typescript
import { ConnectionManager } from '../../src/classes/ConnectionManager.js';

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    connectionManager = new ConnectionManager();
  });

  test('should validate database configuration', () => {
    const config = {
      type: 'postgresql',
      host: 'localhost',
      database: 'test',
      username: 'user',
      password: 'pass'
    };

    const validation = connectionManager.validateConfig('test', config);
    expect(validation.isValid).toBe(true);
  });

  test('should reject invalid configuration', () => {
    const config = {
      type: 'postgresql'
      // Missing required fields
    };

    const validation = connectionManager.validateConfig('test', config);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});
```

### Database Adapter Tests

Test individual database adapters:

```typescript
import { MySQLAdapter } from '../../src/database/adapters/mysql.js';

describe('MySQLAdapter', () => {
  let adapter: MySQLAdapter;
  let mockConnection: any;

  beforeEach(() => {
    const config = {
      host: 'localhost',
      port: 3306,
      database: 'test',
      username: 'user',
      password: 'pass'
    };
    adapter = new MySQLAdapter(config);
  });

  test('should handle connection errors gracefully', async () => {
    // Mock connection failure
    jest.spyOn(adapter, 'connect').mockRejectedValue(
      new Error('Connection refused')
    );

    await expect(adapter.connect()).rejects.toThrow('Connection refused');
  });

  test('should execute queries with proper error handling', async () => {
    const mockResult = {
      rows: [{ id: 1, name: 'test' }],
      fields: [{ name: 'id' }, { name: 'name' }]
    };

    jest.spyOn(adapter, 'executeQuery').mockResolvedValue({
      rows: mockResult.rows,
      rowCount: 1,
      fields: ['id', 'name'],
      execution_time_ms: 50
    });

    const result = await adapter.executeQuery(
      mockConnection,
      'SELECT * FROM test'
    );

    expect(result.rows).toHaveLength(1);
    expect(result.fields).toContain('id');
    expect(result.execution_time_ms).toBeGreaterThan(0);
  });
});
```

## Integration Testing

### MCP Server Integration Tests

Test the complete MCP server workflow:

```typescript
import { SQLMCPServer } from '../../src/classes/SQLMCPServer.js';

describe('SQLMCPServer Integration', () => {
  let server: SQLMCPServer;
  let testConfig: any;

  beforeEach(async () => {
    testConfig = {
      databases: {
        test: {
          type: 'sqlite',
          file: ':memory:',
          select_only: true
        }
      },
      security: {
        max_joins: 10,
        max_subqueries: 5
      }
    };

    server = new SQLMCPServer(testConfig);
    await server.initialize();
  });

  afterEach(async () => {
    await server.shutdown();
  });

  test('should execute SQL query through MCP protocol', async () => {
    const mcpRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sql_query',
        arguments: {
          database: 'test',
          query: 'SELECT 1 as test_value'
        }
      }
    };

    const response = await server.handleRequest(mcpRequest);

    expect(response).toBeValidMCPResponse();
    expect(response.result).toBeDefined();
    expect(response.result.content[0].text).toContain('test_value');
  });

  test('should reject unsafe queries', async () => {
    const mcpRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sql_query',
        arguments: {
          database: 'test',
          query: 'DROP TABLE users'
        }
      }
    };

    const response = await server.handleRequest(mcpRequest);

    expect(response.error).toBeDefined();
    expect(response.error.message).toContain('DROP');
  });
});
```

### Database-Specific Integration Tests

Test each database type:

```typescript
describe('Database Integration Tests', () => {
  describe('PostgreSQL Integration', () => {
    test('should connect and query PostgreSQL', async () => {
      // Test with actual PostgreSQL connection if available
      const config = {
        type: 'postgresql',
        host: process.env.PG_HOST || 'localhost',
        database: process.env.PG_DB || 'test',
        username: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'password'
      };

      if (!process.env.CI && process.env.PG_HOST) {
        const adapter = new PostgreSQLAdapter(config);
        const connection = await adapter.connect();
        
        const result = await adapter.executeQuery(
          connection, 
          'SELECT version() as version'
        );
        
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].version).toContain('PostgreSQL');
        
        await adapter.disconnect(connection);
      }
    });
  });
});
```

## Custom Test Matchers

The project provides custom Jest matchers for domain-specific assertions:

### SQL Query Matchers

```typescript
// Check if string is a valid SQL query
expect(query).toBeValidQuery();

// Check if query contains specific SQL keywords
expect(query).toContainSqlKeyword('SELECT');
expect(query).toContainSqlKeyword('JOIN');
```

### MCP Protocol Matchers

```typescript
// Validate MCP response structure
expect(response).toBeValidMCPResponse();

// Validate query result structure
expect(result).toHaveValidQueryResult();
```

### Usage Examples

```typescript
test('should return valid MCP response', async () => {
  const response = await server.handleSQLQuery('test', 'SELECT 1');
  
  expect(response).toBeValidMCPResponse();
  expect(response.result.content[0].text).toContain('Query executed');
});

test('should return proper query result', async () => {
  const result = await adapter.executeQuery(connection, 'SELECT * FROM users');
  
  expect(result).toHaveValidQueryResult();
  expect(result.rows).toBeDefined();
  expect(result.execution_time_ms).toBeGreaterThan(0);
});
```

## Test Data and Fixtures

### Sample Queries (`tests/fixtures/sample-queries.ts`)

Comprehensive collection of SQL queries for testing:

```typescript
import { SampleQueries } from '../fixtures/sample-queries.js';

// Use predefined safe queries
const safeQueries = SampleQueries.getSafeQueries();

// Use unsafe queries for security testing
const unsafeQueries = SampleQueries.getUnsafeQueries();

// Use complexity test queries
const complexQueries = SampleQueries.getComplexityTestQueries();

test('should handle complex analytical queries', async () => {
  const query = SampleQueries.analyticalQueries.cohortAnalysis;
  const result = await securityManager.validateQuery(query);
  expect(result.allowed).toBe(true);
});
```

### Mock Database Configurations

```typescript
import { TestConfigs } from '../fixtures/test-configs.js';

test('should validate various database configurations', () => {
  const configs = TestConfigs.getAllDatabaseConfigs();
  
  for (const [name, config] of Object.entries(configs)) {
    const validation = connectionManager.validateConfig(name, config);
    expect(validation.isValid).toBe(true);
  }
});
```

## Testing Best Practices

### Test Organization

```typescript
describe('Component/Feature Name', () => {
  // Setup and teardown
  beforeEach(() => { /* setup */ });
  afterEach(() => { /* cleanup */ });

  describe('Specific functionality', () => {
    test('should do something specific', () => {
      // Arrange
      const input = 'test input';
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe('expected output');
    });
  });

  describe('Error scenarios', () => {
    test('should handle invalid input gracefully', () => {
      expect(() => functionUnderTest(null))
        .toThrow('Invalid input');
    });
  });
});
```

### Async Testing

```typescript
test('should handle async operations', async () => {
  const promise = asyncFunction();
  
  await expect(promise).resolves.toBeDefined();
  // or
  await expect(promise).rejects.toThrow('Error message');
});

test('should timeout appropriately', async () => {
  const slowOperation = new Promise(resolve => 
    setTimeout(resolve, 5000)
  );
  
  await expect(slowOperation).rejects.toThrow('timeout');
}, 10000); // 10 second timeout
```

### Mock Management

```typescript
describe('Component with dependencies', () => {
  let mockDependency: jest.Mocked<DependencyType>;

  beforeEach(() => {
    mockDependency = {
      method1: jest.fn(),
      method2: jest.fn().mockResolvedValue('mock result')
    } as jest.Mocked<DependencyType>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should use dependency correctly', async () => {
    const component = new Component(mockDependency);
    await component.doSomething();
    
    expect(mockDependency.method1).toHaveBeenCalledWith('expected argument');
    expect(mockDependency.method2).toHaveBeenCalledTimes(1);
  });
});
```

## Performance Testing

### Benchmarking Tests

```typescript
describe('Performance Tests', () => {
  test('should execute queries within performance threshold', async () => {
    const startTime = Date.now();
    
    await adapter.executeQuery(connection, 'SELECT * FROM large_table LIMIT 1000');
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // 5 second threshold
  });

  test('should handle concurrent connections efficiently', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => 
      adapter.executeQuery(connection, `SELECT ${i} as test_value`)
    );
    
    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(10);
    results.forEach((result, i) => {
      expect(result.rows[0].test_value).toBe(i);
    });
  });
});
```

### Memory Leak Testing

```typescript
test('should not leak memory with repeated operations', async () => {
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Perform many operations
  for (let i = 0; i < 1000; i++) {
    await securityManager.validateQuery('SELECT 1');
  }
  
  // Force garbage collection
  if (global.gc) global.gc();
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  // Should not increase by more than 50MB
  expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
});
```

## Continuous Integration

### GitHub Actions Integration

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint:check
      
      - name: Run type checking
        run: npm run type-check
      
      - name: Run tests
        run: npm run test:coverage
        env:
          PG_HOST: localhost
          PG_USER: postgres
          PG_PASSWORD: password
          PG_DB: postgres
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

### Test Scripts in package.json

```json
{
  "scripts": {
    "test": "jest --passWithNoTests",
    "test:unit": "jest tests/unit --passWithNoTests",
    "test:integration": "jest tests/integration --passWithNoTests",
    "test:watch": "jest --watch --passWithNoTests",
    "test:coverage": "jest --coverage --passWithNoTests",
    "test:ci": "jest --ci --coverage --watchAll=false"
  }
}
```

## Debugging Tests

### Debug Configuration

```bash
# Run tests with verbose output
VERBOSE_TESTS=1 npm test

# Run specific test file
npm test -- security-manager.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should validate"

# Debug with Node.js inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

### VS Code Debug Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen",
  "disableOptimisticBPs": true
}
```

### Common Debugging Techniques

```typescript
test('debug test execution', async () => {
  console.log('Test starting...');
  
  const result = await functionUnderTest();
  console.log('Result:', JSON.stringify(result, null, 2));
  
  expect(result).toBeDefined();
});

// Use debugger statement
test('interactive debugging', () => {
  debugger; // Will break here when debugging
  const result = processData();
  expect(result).toBe('expected');
});
```

## Coverage Requirements

### Coverage Thresholds

The project maintains high test coverage:

- **Statements**: 85%+
- **Branches**: 80%+
- **Functions**: 90%+
- **Lines**: 85%+

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html

# View text summary
cat coverage/lcov.info
```

## Testing Checklist

### Before Committing

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint:check`
- [ ] Type checking passes: `npm run type-check`
- [ ] Coverage meets thresholds: `npm run test:coverage`
- [ ] Integration tests pass: `npm run test:integration`

### Writing New Tests

- [ ] Test covers both success and error scenarios
- [ ] Uses appropriate test data from fixtures
- [ ] Includes performance considerations for critical paths
- [ ] Follows project naming conventions
- [ ] Uses custom matchers when appropriate
- [ ] Properly mocks external dependencies

### Review Checklist

- [ ] Tests are focused and test one thing
- [ ] Test names clearly describe expected behavior
- [ ] Setup and teardown is proper
- [ ] No hardcoded values that should be configurable
- [ ] Tests are deterministic and not flaky
- [ ] Edge cases are covered

## Troubleshooting

### Common Issues

#### Tests Timeout
```
Error: Timeout - Async callback was not invoked within the 30000ms timeout
```

**Solutions:**
- Increase timeout: `jest.setTimeout(60000)`
- Check for unresolved promises
- Ensure proper cleanup in `afterEach`

#### Mock Issues
```
Error: Cannot spy on a property that is not defined
```

**Solutions:**
- Ensure object exists before mocking
- Use proper mock implementation
- Check import paths

#### Memory Issues
```
Error: JavaScript heap out of memory
```

**Solutions:**
- Run tests with more memory: `node --max-old-space-size=4096`
- Check for memory leaks in tests
- Use `--runInBand` to reduce parallel execution

## Conclusion

The SQL MCP Server testing strategy provides comprehensive coverage through:

- **Multiple test types** (unit, integration, performance)
- **Custom matchers** for domain-specific validation
- **Comprehensive fixtures** for realistic testing scenarios
- **Automated CI/CD integration** for continuous quality assurance
- **Detailed debugging support** for efficient development

This testing approach ensures high code quality, reliability, and maintainability while supporting rapid development and refactoring.

For additional help:
- [Jest Documentation](https://jestjs.io/docs)
- [TypeScript Testing Guide](https://typescript-eslint.io/docs/linting/type-linting)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Project Contributing Guide](contributing.md)
