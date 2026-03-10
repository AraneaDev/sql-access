# Release Process Guide

This guide outlines the complete release process for the SQL MCP Server, including versioning, testing, documentation, and deployment procedures.

## Overview

The SQL MCP Server follows semantic versioning and maintains a structured release process that ensures quality, stability, and proper change management. Every release goes through comprehensive testing, documentation updates, and deployment validation.

**Release Cycle:**
- **Major versions** (X.0.0) - Breaking changes, major new features
- **Minor versions** (X.Y.0) - New features, backwards compatible
- **Patch versions** (X.Y.Z) - Bug fixes, security patches

**Current Version:** 2.0.0

## Versioning Strategy

### Semantic Versioning (SemVer)

The project follows [semantic versioning](https://semver.org/) strictly:

```
MAJOR.MINOR.PATCH

Example: 2.1.3
|-- 2: Major version (breaking changes)
|-- 1: Minor version (new features, backwards compatible)
\-- 3: Patch version (bug fixes)
```

### Version Bump Guidelines

#### Major Version (X.0.0)
**Breaking Changes:**
- API interface changes that break backward compatibility
- Configuration format changes
- Removal of deprecated features
- Database schema changes requiring migration

```typescript
// Example: Breaking API change
// v1.x.x
class SecurityManager {
 validateQuery(query: string): boolean { }
}

// v2.1.0
class SecurityManager {
 validateQuery(query: string): Promise<SecurityValidation> { } // Changed return type
}
```

#### Minor Version (X.Y.0)
**New Features:**
- New database adapter support
- Additional MCP tools
- New configuration options (with defaults)
- Performance improvements
- New utility functions

```typescript
// Example: New feature addition
// v2.1.0 - Added batch query support
class SecurityManager {
 validateQuery(query: string): Promise<SecurityValidation> { }
 
 // New method added in v2.1.0
 validateBatchQueries(queries: BatchQuery[]): Promise<BatchValidationResult> { }
}
```

#### Patch Version (X.Y.Z)
**Bug Fixes:**
- Security vulnerability fixes
- Bug fixes that don't change API
- Documentation corrections
- Test improvements
- Dependency updates (non-breaking)

```typescript
// Example: Bug fix
// v2.1.3 - Fixed query complexity calculation
private analyzeQueryComplexity(query: string): QueryComplexityAnalysis {
 // Fixed: Incorrect JOIN count calculation
 const joinCount = (query.toUpperCase().match(/\bJOIN\b/g) || []).length;
 // Previous buggy version counted all occurrences of 'JOIN' substring
}
```

### Pre-release Versions

For development and testing releases:

```
2.1.0-alpha.1 # Early development
2.1.0-beta.1 # Feature complete, testing
2.1.0-rc.1 # Release candidate, final testing
```

## Release Workflow

### 1. Pre-Release Planning

#### Version Planning Meeting
- Review completed features and bug fixes
- Determine version type (major/minor/patch)
- Identify any breaking changes
- Plan release timeline
- Assign release responsibilities

#### Release Branch Strategy

```bash
# Create release branch from main
git checkout main
git pull origin main
git checkout -b release/2.1.0

# Development continues on main
# Bug fixes for release go on release branch
```

### 2. Code Preparation

#### Update Version Numbers

```json
// package.json
{
 "name": "sql-access",
 "version": "2.1.0",
 "description": "MCP server for accessing SQL databases"
}
```

#### Update Documentation

```bash
# Update version references in documentation
grep -r "version.*2\.0\.0" docs/ | # Find old version references
sed -i 's/2\.0\.0/2.1.0/g' docs/ # Update to new version
```

#### Dependencies Review

```bash
# Check for outdated dependencies
npm audit
npm outdated

# Update non-breaking dependencies
npm update

# Review and test breaking dependency updates manually
```

### 3. Quality Assurance

#### Automated Testing Pipeline

```bash
# Run complete test suite
npm run validate

# This runs:
# - npm run lint:check # Code style validation
# - npm run type-check # TypeScript compilation
# - npm run test:coverage # Full test suite with coverage
```

#### Manual Testing Checklist

- [ ] **Database Connectivity**: Test all database types (PostgreSQL, MySQL, SQLite, SQL Server)
- [ ] **SSH Tunneling**: Verify SSH tunnel functionality
- [ ] **Security Validation**: Test query validation with various scenarios
- [ ] **MCP Protocol**: Verify MCP tool integration with Claude Desktop
- [ ] **Performance**: Run performance benchmarks
- [ ] **Configuration**: Test configuration validation and error handling
- [ ] **Documentation**: Verify all examples in documentation work

#### Integration Testing

```bash
# Run integration tests with real databases
docker-compose up -d # Start test databases

# Test each database type
npm run test:integration -- --testNamePattern="PostgreSQL"
npm run test:integration -- --testNamePattern="MySQL"
npm run test:integration -- --testNamePattern="SQLite"
npm run test:integration -- --testNamePattern="SQL Server"

docker-compose down # Clean up
```

#### Security Audit

```bash
# Run security audit
npm audit --audit-level high

# Check for vulnerable dependencies
npm audit fix

# Manual security review
# - Review new/changed SQL parsing logic
# - Validate input sanitization
# - Check error message sanitization
# - Review authentication/authorization changes
```

### 4. Documentation Updates

#### Release Notes Preparation

Create `CHANGELOG.md` entry:

```markdown
## [2.1.0] - 2024-08-12

### Added
- Batch query validation support
- PostgreSQL array and JSON query support
- Enhanced SSH tunnel monitoring
- New configuration validation utilities

### Changed 
- Improved query complexity analysis algorithm
- Enhanced error messages for better debugging
- Updated TypeScript to v5.0.0

### Fixed
- Fixed connection leak in MySQL adapter
- Resolved SSH tunnel reconnection issues
- Fixed query parsing edge cases with comments

### Security
- Enhanced SQL injection prevention
- Improved error message sanitization
- Updated vulnerable dependencies

### Breaking Changes
- None in this release

### Deprecated 
- Legacy configuration format (will be removed in v3.0.0)

### Migration Guide
No migration required for this version.
```

#### Documentation Version Update

```bash
# Update version in documentation
find docs -name "*.md" -exec sed -i 's/Version: [0-9]\+\.[0-9]\+\.[0-9]\+/Version: 2.1.0/g' {} \;

# Update API documentation
npm run docs:generate # If automated docs generation exists

# Review and update:
# - Installation instructions
# - Configuration examples 
# - API reference
# - Tutorial content
# - Troubleshooting guides
```

### 5. Build and Packaging

#### Production Build

```bash
# Clean build
npm run clean

# Production build with all validations
npm run build:production

# Verify build output
ls -la dist/
file dist/index.js # Should be JavaScript, not TypeScript

# Test built version
node dist/index.js --version
```

#### Package Preparation

```bash
# Verify package contents
npm pack --dry-run

# Check included/excluded files
cat .npmignore
grep -E "^(files|main|bin)" package.json

# Test installation locally
npm pack
npm install -g sql-access-2.1.0.tgz
sql-server --version
npm uninstall -g sql-access
```

#### Build Artifacts

```bash
# Generate checksums
sha256sum dist/index.js > dist/checksums.txt
sha256sum sql-access-2.1.0.tgz >> dist/checksums.txt

# Create source archive
git archive --format=tar.gz --prefix=sql-access-2.1.0/ v2.1.0 > sql-access-2.1.0-src.tar.gz
```

### 6. Release Deployment

#### GitHub Release Process

```bash
# Tag the release
git tag -a v2.1.0 -m "Release version 2.1.0

- Added batch query validation support
- Enhanced SSH tunnel monitoring 
- Fixed connection leak issues
- Improved security validation

See CHANGELOG.md for complete details."

# Push tag to origin
git push origin v2.1.0

# Push release branch
git push origin release/2.1.0
```

#### GitHub Release Creation

1. **Navigate to GitHub Releases**
 - Go to repository -> Releases -> Draft a new release

2. **Release Configuration**
 ```
 Tag version: v2.1.0
 Release title: SQL MCP Server v2.1.0
 
 Target: main (after merging release branch)
 ```

3. **Release Description Template**
 ```markdown
 ## SQL MCP Server v2.1.0
 
 This release adds batch query support, enhanced monitoring, and several bug fixes.
 
 ### New Features
 - Batch query validation with comprehensive analysis
 - Enhanced SSH tunnel health monitoring
 - Improved query complexity analysis
 
 ### Bug Fixes
 - Fixed MySQL connection leak in high-load scenarios
 - Resolved SSH tunnel reconnection edge cases
 - Fixed query parsing with embedded comments
 
 ### Security Improvements
 - Enhanced SQL injection prevention
 - Improved error message sanitization
 - Updated dependencies with security fixes
 
 ### Documentation
 - Updated all database configuration guides
 - Added batch query examples
 - Enhanced troubleshooting documentation
 
 ## Installation
 
 ```bash
 npm install -g sql-access@2.1.0
 ```
 
 ## Upgrade from v2.0.x
 
 This release is fully backward compatible. No configuration changes required.
 
 ```bash
 npm update -g sql-access
 ```
 
 ## Full Changelog
 
 See [CHANGELOG.md](CHANGELOG.md) for complete details.
 
 ## Contributors
 
 Thanks to all contributors who made this release possible!
 ```

4. **Attach Release Assets**
 - `sql-access-2.1.0.tgz` (npm package)
 - `sql-access-2.1.0-src.tar.gz` (source code)
 - `checksums.txt` (file integrity verification)

#### NPM Publishing

```bash
# Verify package before publishing
npm pack
tar -tzf sql-access-2.1.0.tgz | head -20

# Login to npm (if not already)
npm login

# Publish to npm
npm publish

# Verify publication
npm view sql-access@2.1.0

# Test installation from npm
npm install -g sql-access@2.1.0
sql-server --version
```

### 7. Post-Release Activities

#### Merge Release Branch

```bash
# Merge release branch back to main
git checkout main
git pull origin main
git merge --no-ff release/2.1.0
git push origin main

# Clean up release branch
git branch -d release/2.1.0
git push origin --delete release/2.1.0
```

#### Update Main Branch

```bash
# Ensure main is ready for next development
git checkout main

# Update version to next development version
sed -i 's/"version": "2.2.0"/"version": "2.3.0-dev"/' package.json

# Commit development version
git add package.json
git commit -m "Bump version to 2.3.0-dev for next development cycle"
git push origin main
```

#### Communication and Announcements

1. **Internal Team Notification**
 - Slack/Teams announcement with release highlights
 - Update project documentation
 - Notify support team of new features

2. **Community Announcements**
 - GitHub Discussions post
 - Update README badges
 - Social media announcements (if applicable)

3. **User Communication**
 - Update documentation website
 - Send notification to users (if mailing list exists)
 - Update examples and tutorials

#### Monitoring Post-Release

```bash
# Monitor npm download stats
npm view sql-access downloads --json

# Monitor GitHub metrics
# - Stars, forks, issues
# - Download counts for releases

# Check for immediate issues
# - Monitor error reporting
# - Review new GitHub issues
# - Check community discussions
```

## Hotfix Release Process

### When Hotfixes Are Needed

- **Critical Security Vulnerabilities**
- **Data Loss or Corruption Issues**
- **Complete Feature Failures**
- **Severe Performance Regressions**

### Hotfix Workflow

```bash
# Create hotfix branch from latest release tag
git checkout v2.1.0
git checkout -b hotfix/2.1.1

# Make minimal fix
# ... edit files ...

# Test the fix thoroughly
npm run test
npm run test:integration

# Update version (patch only)
sed -i 's/"version": "2.1.0"/"version": "2.1.1"/' package.json

# Update changelog
cat >> CHANGELOG.md << 'EOF'
## [2.1.1] - 2024-08-15

### Fixed
- Critical security fix for SQL injection vulnerability
- Fixed connection pool leak under high load

### Security
- Patched SQL injection in query parameter handling
EOF

# Commit and tag
git add .
git commit -m "Hotfix 2.1.1: Critical security and stability fixes"
git tag -a v2.1.1 -m "Hotfix release 2.1.1"

# Push hotfix
git push origin hotfix/2.1.1
git push origin v2.1.1

# Deploy immediately
npm publish

# Merge back to main
git checkout main
git merge --no-ff hotfix/2.1.1
git push origin main

# Clean up
git branch -d hotfix/2.1.1
git push origin --delete hotfix/2.1.1
```

## Release Automation

### GitHub Actions Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
 push:
 tags:
 - 'v*'

jobs:
 release:
 runs-on: ubuntu-latest
 
 steps:
 - name: Checkout
 uses: actions/checkout@v3
 with:
 fetch-depth: 0
 
 - name: Setup Node.js
 uses: actions/setup-node@v3
 with:
 node-version: '18'
 registry-url: 'https://registry.npmjs.org'
 cache: 'npm'
 
 - name: Install dependencies
 run: npm ci
 
 - name: Run tests
 run: npm run validate
 
 - name: Build
 run: npm run build:production
 
 - name: Create package
 run: npm pack
 
 - name: Generate checksums
 run: |
 sha256sum *.tgz > checksums.txt
 sha256sum dist/index.js >> checksums.txt
 
 - name: Publish to NPM
 run: npm publish
 env:
 NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
 
 - name: Create GitHub Release
 uses: actions/create-release@v1
 env:
 GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
 with:
 tag_name: ${{ github.ref }}
 release_name: SQL MCP Server ${{ github.ref }}
 draft: false
 prerelease: false
 
 - name: Upload Assets
 uses: actions/upload-release-asset@v1
 env:
 GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
 with:
 upload_url: ${{ steps.create_release.outputs.upload_url }}
 asset_path: ./sql-access-*.tgz
 asset_name: sql-access-${{ github.ref }}.tgz
 asset_content_type: application/gzip
```

### Release Scripts

```javascript
// scripts/release.js - Automated release helper
const fs = require('fs');
const { execSync } = require('child_process');
const semver = require('semver');

class ReleaseManager {
 constructor() {
 this.packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
 this.currentVersion = this.packageJson.version;
 }

 validatePrerequisites() {
 console.log(' Validating release prerequisites...');
 
 // Check git status
 const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
 if (gitStatus.trim()) {
 throw new Error('Working directory must be clean before release');
 }

 // Check branch
 const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
 if (branch !== 'main' && !branch.startsWith('release/')) {
 throw new Error('Releases must be made from main or release branch');
 }

 // Run tests
 execSync('npm run validate', { stdio: 'inherit' });
 
 console.log(' Prerequisites validated');
 }

 bumpVersion(type) {
 console.log(` Bumping ${type} version from ${this.currentVersion}`);
 
 const newVersion = semver.inc(this.currentVersion, type);
 if (!newVersion) {
 throw new Error(`Invalid version bump: ${type}`);
 }

 // Update package.json
 this.packageJson.version = newVersion;
 fs.writeFileSync('package.json', JSON.stringify(this.packageJson, null, 2) + '\n');
 
 console.log(` Version bumped to ${newVersion}`);
 return newVersion;
 }

 updateChangelog(version, changes) {
 console.log(' Updating CHANGELOG.md...');
 
 const date = new Date().toISOString().split('T')[0];
 const changelogEntry = `## [${version}] - ${date}\n\n${changes}\n\n`;
 
 let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
 const insertPoint = changelog.indexOf('## [');
 
 if (insertPoint === -1) {
 changelog = `# Changelog\n\n${changelogEntry}${changelog}`;
 } else {
 changelog = 
 changelog.slice(0, insertPoint) + 
 changelogEntry + 
 changelog.slice(insertPoint);
 }
 
 fs.writeFileSync('CHANGELOG.md', changelog);
 console.log(' CHANGELOG.md updated');
 }

 createTag(version) {
 console.log(` Creating tag v${version}...`);
 
 execSync(`git add package.json CHANGELOG.md`);
 execSync(`git commit -m "Release version ${version}"`);
 execSync(`git tag -a v${version} -m "Release version ${version}"`);
 
 console.log(' Tag created');
 }

 async release(type, changes) {
 try {
 this.validatePrerequisites();
 const newVersion = this.bumpVersion(type);
 this.updateChangelog(newVersion, changes);
 this.createTag(newVersion);
 
 console.log(` Release ${newVersion} prepared successfully!`);
 console.log('Next steps:');
 console.log('1. Push tags: git push origin v' + newVersion);
 console.log('2. GitHub Actions will handle the rest');
 
 } catch (error) {
 console.error(' Release failed:', error.message);
 process.exit(1);
 }
 }
}

// CLI usage
if (require.main === module) {
 const [,, type, ...changesList] = process.argv;
 const changes = changesList.join(' ');
 
 if (!['patch', 'minor', 'major'].includes(type)) {
 console.error('Usage: node scripts/release.js <patch|minor|major> <changes>');
 process.exit(1);
 }
 
 new ReleaseManager().release(type, changes);
}

module.exports = ReleaseManager;
```

## Quality Gates

### Pre-Release Checklist

Before any release can proceed, all quality gates must pass:

#### Code Quality Gates
- [ ] All tests pass (unit + integration)
- [ ] Code coverage >= 85%
- [ ] No ESLint errors or warnings
- [ ] TypeScript compilation successful
- [ ] No security vulnerabilities (npm audit)

#### Documentation Gates
- [ ] CHANGELOG.md updated
- [ ] Version references updated in docs
- [ ] API documentation current
- [ ] README.md reflects current features
- [ ] Migration guide available (for breaking changes)

#### Security Gates
- [ ] Dependency security scan passed
- [ ] Manual security review completed
- [ ] Error message sanitization verified
- [ ] Input validation tested

#### Performance Gates
- [ ] Performance benchmarks within acceptable range
- [ ] Memory usage tests passed
- [ ] No performance regressions detected

## Rollback Procedures

### NPM Package Rollback

```bash
# Deprecate problematic version
npm deprecate sql-access@2.1.0 "This version has critical issues. Please upgrade to 2.1.1"

# If severe issues, unpublish (within 24 hours)
npm unpublish sql-access@2.1.0
```

### GitHub Release Rollback

1. **Mark release as pre-release** to hide from main releases
2. **Edit release notes** to warn about issues
3. **Create new hotfix release** with fixes
4. **Delete problematic release** if extremely severe

### User Communication

```markdown
# Critical Security Update Required

**Action Required:** All users of SQL MCP Server v2.1.0 must upgrade immediately.

## Issue
Version 2.1.0 contains a critical security vulnerability that could allow SQL injection attacks.

## Solution
Upgrade to v2.1.1 immediately:

```bash
npm update -g sql-access
```

## Timeline
- v2.1.0 released: August 12, 2024
- Issue discovered: August 15, 2024
- v2.1.1 hotfix released: August 15, 2024

We apologize for any inconvenience and have implemented additional security testing procedures.
```

## Release Metrics and Monitoring

### Success Metrics

Track these metrics for each release:

- **Adoption Rate**: Download/install statistics
- **Issue Rate**: New issues reported post-release
- **Performance**: Response times and resource usage
- **Security**: Vulnerability reports and fixes
- **User Satisfaction**: Community feedback and ratings

### Monitoring Dashboard

```javascript
// Release monitoring script
const releaseMetrics = {
 version: '2.1.0',
 releaseDate: '2024-08-12',
 downloads: {
 npm: await getNpmDownloads('sql-access', '2.1.0'),
 github: await getGitHubReleaseDownloads('v2.1.0')
 },
 issues: {
 total: await getGitHubIssues({ since: '2024-08-12' }),
 critical: await getGitHubIssues({ since: '2024-08-12', labels: ['critical'] }),
 bugs: await getGitHubIssues({ since: '2024-08-12', labels: ['bug'] })
 },
 performance: {
 avgResponseTime: await getPerformanceMetrics(),
 memoryUsage: await getMemoryMetrics(),
 errorRate: await getErrorRate()
 }
};
```

## Conclusion

This comprehensive release process ensures that every SQL MCP Server release meets high standards for quality, security, and reliability. The structured approach minimizes risks while maintaining development velocity and user satisfaction.

**Key Principles:**
- **Quality First**: Comprehensive testing before any release
- **Clear Communication**: Transparent changelog and user notification
- **Security Focus**: Security validation at every step
- **Rollback Ready**: Prepared procedures for handling issues
- **Continuous Improvement**: Metrics-driven process refinement

Following this process helps maintain the project's reputation for reliability while enabling rapid iteration and improvement.

## Quick Reference

### Release Commands

```bash
# Patch release (bug fixes)
npm run release:patch

# Minor release (new features)
npm run release:minor

# Major release (breaking changes)
npm run release:major

# Hotfix release
npm run release:hotfix

# Pre-release
npm run release:beta
```

### Emergency Contacts

- **Release Manager**: [Primary contact]
- **Security Team**: [Security contact]
- **DevOps Team**: [Infrastructure contact]
- **Community Manager**: [User communication]

---

*For questions about the release process or to suggest improvements, please create an issue or discussion in the project repository.*
