// tests/unit/config-validation.test.ts
import { validateDatabaseConfig } from '../../src/utils/config.js';

const base = {
  type: 'mysql' as const,
  host: 'localhost',
  port: 3306,
  user: 'u',
  password: 'p',
  database: 'db',
};

describe('validateDatabaseConfig', () => {
  it('passes valid mysql config', () => {
    expect(validateDatabaseConfig(base as any).valid).toBe(true);
  });
  it('fails when host is missing for mysql', () => {
    const r = validateDatabaseConfig({ ...base, host: '' } as any);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: any) => e.field === 'host')).toBe(true);
  });
  it('fails with embedded credentials in host', () => {
    const r = validateDatabaseConfig({ ...base, host: 'user:pass@myhost' } as any);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: any) => e.field === 'host')).toBe(true);
  });
  it('fails when port is out of range', () => {
    const r = validateDatabaseConfig({ ...base, port: 99999 } as any);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: any) => e.field === 'port')).toBe(true);
  });
  it('fails when database name has shell metacharacters', () => {
    const r = validateDatabaseConfig({ ...base, database: 'db;rm -rf' } as any);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: any) => e.field === 'database')).toBe(true);
  });
  it('passes valid sqlite config (only filename required)', () => {
    const r = validateDatabaseConfig({ type: 'sqlite', filename: '/tmp/test.db' } as any);
    expect(r.valid).toBe(true);
  });
  it('fails sqlite config with no filename', () => {
    const r = validateDatabaseConfig({ type: 'sqlite' } as any);
    expect(r.valid).toBe(false);
  });
});
