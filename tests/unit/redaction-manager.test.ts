/**
 * Unit tests for RedactionManager and redaction patterns
 */

import { RedactionManager, RedactionPatterns } from '../../src/classes/RedactionManager.js';
import type { DatabaseRedactionConfig, FieldRedactionRule, QueryResult } from '../../src/types/index.js';

describe('RedactionPatterns', () => {
 describe('fullMask', () => {
 it('should mask entire string with asterisks', () => {
 expect(RedactionPatterns.fullMask('sensitive')).toBe('*********');
 expect(RedactionPatterns.fullMask('test', '#')).toBe('####');
 expect(RedactionPatterns.fullMask('')).toBe('');
 });

 it('should limit mask length to 10 characters', () => {
 expect(RedactionPatterns.fullMask('verylongsentivedata')).toBe('**********');
 });
 });

 describe('partialMaskEmail', () => {
 it('should partially mask email addresses', () => {
 expect(RedactionPatterns.partialMaskEmail('john.doe@example.com')).toBe('j******.e@*****.com');
 expect(RedactionPatterns.partialMaskEmail('a@b.co')).toBe('a@*.co');
 expect(RedactionPatterns.partialMaskEmail('test@domain.org')).toBe('t**t@*****.org');
 });

 it('should handle invalid email formats', () => {
 expect(RedactionPatterns.partialMaskEmail('not-an-email')).toBe('**********'); // 12 chars -> 10 chars (fullMask limit)
 expect(RedactionPatterns.partialMaskEmail('missing@')).toBe('********'); // 8 chars -> 8 chars
 });
 });

 describe('partialMaskPhone', () => {
 it('should partially mask phone numbers', () => {
 expect(RedactionPatterns.partialMaskPhone('(555) 123-4567')).toBe('(***)***-4567');
 expect(RedactionPatterns.partialMaskPhone('555-123-4567')).toBe('***-***-4567');
 expect(RedactionPatterns.partialMaskPhone('+1-555-123-4567')).toBe('+*-***-***-4567');
 });

 it('should handle short numbers', () => {
 expect(RedactionPatterns.partialMaskPhone('123-4567')).toBe('***-4567');
 expect(RedactionPatterns.partialMaskPhone('123')).toBe('***');
 });
 });

 describe('smartPartialMask', () => {
 it('should detect and mask emails appropriately', () => {
 const result = RedactionPatterns.smartPartialMask('user@domain.com');
 expect(result).toContain('@');
 expect(result).toContain('.com');
 expect(result).toContain('*');
 });

 it('should detect and mask phone numbers', () => {
 const result = RedactionPatterns.smartPartialMask('555-123-4567');
 expect(result).toContain('4567');
 expect(result).toContain('*');
 });

 it('should use generic masking for other strings', () => {
 expect(RedactionPatterns.smartPartialMask('sensitive')).toBe('s*******e');
 expect(RedactionPatterns.smartPartialMask('ab')).toBe('**');
 });
 });
});

describe('RedactionManager', () => {
 let redactionManager: RedactionManager;

 beforeEach(() => {
 const config: DatabaseRedactionConfig = {
 enabled: true,
 rules: [
 {
 field_pattern: 'email',
 pattern_type: 'exact',
 redaction_type: 'partial_mask',
 preserve_format: true
 },
 {
 field_pattern: '*phone*',
 pattern_type: 'wildcard',
 redaction_type: 'full_mask'
 },
 {
 field_pattern: 'ssn',
 pattern_type: 'exact',
 redaction_type: 'replace',
 replacement_text: '[SSN_REDACTED]'
 }
 ],
 log_redacted_access: false,
 case_sensitive_matching: false
 };

 redactionManager = new RedactionManager(config);
 });

 describe('shouldRedactField', () => {
 it('should match exact field names', () => {
 const rule = redactionManager.shouldRedactField('email');
 expect(rule).toBeTruthy();
 expect(rule?.redaction_type).toBe('partial_mask');
 });

 it('should match wildcard patterns', () => {
 const rule1 = redactionManager.shouldRedactField('user_phone');
 const rule2 = redactionManager.shouldRedactField('phone_number');
 const rule3 = redactionManager.shouldRedactField('mobile_phone_primary');
 
 expect(rule1).toBeTruthy();
 expect(rule2).toBeTruthy();
 expect(rule3).toBeTruthy();
 expect(rule1?.redaction_type).toBe('full_mask');
 });

 it('should not match non-matching fields', () => {
 const rule = redactionManager.shouldRedactField('username');
 expect(rule).toBeNull();
 });

 it('should handle case insensitive matching by default', () => {
 const rule = redactionManager.shouldRedactField('EMAIL');
 expect(rule).toBeTruthy();
 });
 });

 describe('redactResults', () => {
 it('should redact matching fields in query results', () => {
 const queryResult: QueryResult = {
 rows: [
 {
 id: 1,
 email: 'john.doe@example.com',
 user_phone: '555-123-4567',
 ssn: '123-45-6789',
 name: 'John Doe'
 },
 {
 id: 2,
 email: 'jane.smith@example.com',
 user_phone: '555-987-6543',
 ssn: '987-65-4321',
 name: 'Jane Smith'
 }
 ],
 rowCount: 2,
 fields: ['id', 'email', 'user_phone', 'ssn', 'name'],
 truncated: false,
 execution_time_ms: 150
 };

 const result = redactionManager.redactResults(queryResult);

 expect(result.redaction).toBeDefined();
 expect(result.redaction?.fields_redacted).toContain('email');
 expect(result.redaction?.fields_redacted).toContain('user_phone');
 expect(result.redaction?.fields_redacted).toContain('ssn');
 expect(result.redaction?.redaction_count).toBe(6); // 3 fields x 2 rows

 // Check that sensitive fields are redacted
 expect(result.rows[0].email).toContain('*');
 expect(result.rows[0].email).toContain('@');
 expect(result.rows[0].user_phone).toBe('**********'); // 12 chars -> 10 chars (fullMask limit)
 expect(result.rows[0].ssn).toBe('[SSN_REDACTED]');
 
 // Check that non-sensitive fields are preserved
 expect(result.rows[0].id).toBe(1);
 expect(result.rows[0].name).toBe('John Doe');
 });

 it('should handle empty results', () => {
 const queryResult: QueryResult = {
 rows: [],
 rowCount: 0,
 fields: [],
 truncated: false,
 execution_time_ms: 50
 };

 const result = redactionManager.redactResults(queryResult);
 expect(result.redaction).toBeUndefined();
 expect(result.rows).toEqual([]);
 });

 it('should preserve null and undefined values', () => {
 const queryResult: QueryResult = {
 rows: [
 {
 email: null,
 user_phone: undefined,
 ssn: '',
 name: 'Test User'
 }
 ],
 rowCount: 1,
 fields: ['email', 'user_phone', 'ssn', 'name'],
 truncated: false,
 execution_time_ms: 100
 };

 const result = redactionManager.redactResults(queryResult);

 expect(result.rows[0].email).toBe(null);
 expect(result.rows[0].user_phone).toBe(undefined);
 expect(result.rows[0].ssn).toBe('[SSN_REDACTED]'); // Empty string gets redacted
 expect(result.rows[0].name).toBe('Test User');
 });
 });

 describe('testRedaction', () => {
 it('should provide test results for sample data', () => {
 const sampleData = {
 id: 123,
 email: 'test@example.com',
 mobile_phone: '555-0123',
 ssn: '123-45-6789',
 username: 'testuser'
 };

 const testResult = redactionManager.testRedaction(sampleData);

 expect(testResult.original).toEqual(sampleData);
 expect(testResult.fields_affected).toContain('email');
 expect(testResult.fields_affected).toContain('mobile_phone');
 expect(testResult.fields_affected).toContain('ssn');
 expect(testResult.fields_affected).not.toContain('username');
 expect(testResult.fields_affected).not.toContain('id');

 expect(testResult.redacted.email).toContain('*');
 expect(testResult.redacted.mobile_phone).toBe('********');
 expect(testResult.redacted.ssn).toBe('[SSN_REDACTED]');
 expect(testResult.redacted.username).toBe('testuser');
 expect(testResult.redacted.id).toBe(123);
 });
 });

 describe('getConfigurationSummary', () => {
 it('should return configuration summary', () => {
 const summary = redactionManager.getConfigurationSummary();

 expect(summary.enabled).toBe(true);
 expect(summary.rule_count).toBe(3);
 expect(summary.rules).toHaveLength(3);
 expect(summary.settings.log_access).toBe(false);
 expect(summary.settings.case_sensitive).toBe(false);

 const emailRule = summary.rules.find(r => r.pattern === 'email');
 expect(emailRule).toBeDefined();
 expect(emailRule?.type).toBe('exact');
 expect(emailRule?.redaction).toBe('partial_mask');
 });
 });
});

describe('Configuration Integration', () => {
 it('should handle complex redaction rules', () => {
 const config: DatabaseRedactionConfig = {
 enabled: true,
 rules: [
 {
 field_pattern: '/^user_.+$/',
 pattern_type: 'regex',
 redaction_type: 'custom',
 custom_pattern: '\\d+',
 replacement_text: '[NUM]'
 },
 {
 field_pattern: '*card*',
 pattern_type: 'wildcard',
 redaction_type: 'full_mask',
 mask_character: '#'
 }
 ],
 log_redacted_access: true,
 case_sensitive_matching: true
 };

 const manager = new RedactionManager(config);
 const summary = manager.getConfigurationSummary();

 expect(summary.rule_count).toBe(2);
 expect(summary.settings.log_access).toBe(true);
 expect(summary.settings.case_sensitive).toBe(true);
 });
});
