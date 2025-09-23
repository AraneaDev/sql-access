# Changelog

All notable changes to the SQL MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2024-09-23

### ✨ Added
- **Field Redaction Implementation** - Automatic masking/replacement of sensitive data in query results
- **Configurable Redaction Rules** - Support for exact match, wildcard, and regex patterns for field matching
- **Multiple Redaction Patterns** - Full masking, partial masking, and custom replacement text options
- **Security-Enhanced Query Results** - Automatic protection of sensitive fields without application changes
- **RedactionManager Class** - Dedicated redaction engine with flexible pattern support
- **Enhanced Configuration Schema** - New redaction configuration options in database settings
- **Audit Logging for Redacted Fields** - Optional logging when redacted fields are accessed
- **Email & Phone Redaction Patterns** - Built-in support for common sensitive data types
- **Preserve Format Options** - Maintain original data structure while redacting content

### 🔧 Changed
- **Database Adapter Integration** - Enhanced base adapter to support field redaction processing
- **Configuration Parser Updates** - Extended configuration parsing to handle redaction rules
- **Query Result Processing** - Updated result normalization to apply redaction before output
- **Setup Wizard Enhancement** - Added interactive redaction configuration during setup
- **Documentation Updates** - Comprehensive redaction feature documentation and examples

### 🐛 Fixed
- **Memory Management** - Improved resource cleanup in redaction processing
- **Type Safety** - Enhanced TypeScript type definitions for redaction configuration
- **Configuration Validation** - Better error handling for malformed redaction rules

### 🔒 Security
- **Sensitive Data Protection** - Automatic redaction prevents accidental exposure of sensitive information
- **Configurable Security Policies** - Flexible rules allow customization per security requirements
- **Data Loss Prevention** - Built-in patterns protect common sensitive data types
- **Audit Trail** - Optional logging provides compliance-ready access tracking

### 📚 Documentation
- **Field Redaction Guide** - Complete documentation for redaction feature configuration
- **Security Best Practices** - Updated security guidance including redaction recommendations
- **Configuration Examples** - Practical examples for common redaction scenarios
- **API Documentation Updates** - Updated TypeScript API reference with redaction interfaces

### 🧪 Testing
- **Redaction Test Suite** - Comprehensive tests for all redaction patterns and configurations
- **Integration Testing** - End-to-end validation of redaction in query workflows
- **Performance Testing** - Validation that redaction adds minimal performance overhead

### Breaking Changes
- **None** - This release is fully backward compatible with v2.1.x

### Migration Guide
No migration is required for this release. Field redaction is an opt-in feature that can be enabled through configuration. All existing configurations and integrations continue to work without changes.

## [2.1.0] - 2024-08-29

### ✨ Added
- **Enhanced SSH Tunneling** with connection pooling and health monitoring
- **Comprehensive test coverage** (427+ tests, 90%+ coverage achieved)
- **Enhanced configuration templates** with detailed examples
- **Port management utilities** for better resource allocation and conflict resolution  
- **Enhanced SSH tunnel examples** and comprehensive documentation
- **Improved error handling** and logging throughout all components
- **Performance optimizations** in connection management and query processing
- **Database adapter improvements** with better type safety and error handling

### 🔧 Changed  
- **Improved ConnectionManager** with better error handling and resource cleanup
- **Enhanced security validation** with more comprehensive SQL injection prevention
- **Updated TypeScript configurations** for better type safety and development experience
- **Optimized query performance analysis** with more accurate complexity calculations
- **Better resource cleanup** and memory management across all components
- **Enhanced logging system** with better error tracking and debugging capabilities

### 🐛 Fixed
- **SSH tunnel connection stability** issues in high-load scenarios
- **Memory leaks** in connection pooling and SSH tunnel management
- **Query complexity calculation** edge cases with complex nested queries
- **Configuration validation** edge cases with malformed INI files
- **File system operation** error handling in schema caching
- **Database adapter** connection recovery in network failure scenarios
- **Port assignment conflicts** in concurrent SSH tunnel creation

### 🔒 Security
- **Enhanced SQL injection prevention** mechanisms with improved pattern detection
- **Improved error message sanitization** to prevent information disclosure
- **Better connection security validation** with stricter SSL/TLS enforcement
- **Enhanced SSH tunnel security** features with better key validation
- **Audit logging improvements** for better security compliance tracking

### 📚 Documentation
- **Complete test coverage documentation** with detailed coverage reports
- **Enhanced SSH tunneling feature documentation** with practical examples
- **Updated API documentation** and comprehensive reference guides
- **Improved troubleshooting guides** with common solutions
- **Better configuration examples** for various deployment scenarios
- **Enhanced tutorial content** for getting started quickly

### 🧪 Testing
- **427+ test scenarios** added across all components
- **90%+ line coverage** achieved for core functionality
- **Comprehensive integration tests** for MCP protocol compliance
- **Performance benchmarking** for database operations
- **Security validation testing** for SQL injection prevention
- **SSH tunnel functionality testing** with real network scenarios
- **Database adapter testing** for all supported database types

### 📦 Build & Development
- **Improved build process** with better error handling
- **Enhanced development tooling** with better debugging support
- **Updated ESLint configuration** with stricter rules
- **Better TypeScript integration** with improved type definitions
- **Automated testing pipeline** improvements

### Breaking Changes
- **None** - This release is fully backward compatible with v2.0.x

### Migration Guide  
No migration is required for this release. All existing configurations, scripts, and integrations will continue to work without changes.

### Deprecation Notices
- Legacy SSH tunnel configuration format will be deprecated in v3.0.0 (still supported in v2.1.0)
- Some internal API methods may be deprecated in future releases (no user impact)

## [2.0.0] - 2024-08-14

### ✨ Added
- Initial release with comprehensive database support
- MCP protocol implementation
- Security features and SQL injection prevention
- SSH tunneling capabilities
- Multi-database support (PostgreSQL, MySQL, SQLite, SQL Server)
- Configuration management and validation
- Performance monitoring and query analysis

### 🔧 Initial Features
- Connection management and pooling
- Schema caching and introspection
- Security validation and audit logging
- Error handling and recovery mechanisms
- Comprehensive documentation and examples

---

## Version Numbering

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backwards compatible manner  
- **PATCH** version for backwards compatible bug fixes

## Support Policy

- **Current Release (2.2.x)**: Full support including new features and bug fixes
- **Previous Release (2.1.x)**: Security fixes and critical bug fixes only
- **Previous Release (2.0.x)**: No longer supported, upgrade recommended
