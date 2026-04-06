// tests/unit/query-cache.test.ts
import { QueryCache } from '../../src/classes/QueryCache.js';

describe('QueryCache', () => {
  let cache: QueryCache;
  const fakeResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new QueryCache();
  });
  afterEach(() => jest.useRealTimers());

  describe('get / set', () => {
    it('returns undefined on cache miss', () => {
      expect(cache.get('db1', 'SELECT 1', [])).toBeUndefined();
    });
    it('returns cached result on hit', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 60);
      const hit = cache.get('db1', 'SELECT 1', []);
      expect(hit).toEqual(fakeResult);
    });
    it('normalises whitespace and case for cache key', () => {
      cache.set('db1', 'SELECT  *  FROM  foo', [], fakeResult, 60);
      const hit = cache.get('db1', 'select * from foo', []);
      expect(hit).toEqual(fakeResult);
    });
    it('returns undefined after TTL expires', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 10);
      jest.advanceTimersByTime(11_000);
      expect(cache.get('db1', 'SELECT 1', [])).toBeUndefined();
    });
    it('does not cache non-deterministic queries', () => {
      cache.set('db1', 'SELECT NOW()', [], fakeResult, 60);
      expect(cache.get('db1', 'SELECT NOW()', [])).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when DB capacity exceeded', () => {
      const smallCache = new QueryCache({ maxEntriesPerDb: 3 });
      smallCache.set('db1', 'SELECT 1', [], fakeResult, 60);
      smallCache.set('db1', 'SELECT 2', [], fakeResult, 60);
      smallCache.set('db1', 'SELECT 3', [], fakeResult, 60);
      smallCache.set('db1', 'SELECT 4', [], fakeResult, 60);
      expect(smallCache.get('db1', 'SELECT 1', [])).toBeUndefined();
      expect(smallCache.get('db1', 'SELECT 4', [])).toEqual(fakeResult);
    });
  });

  describe('invalidate', () => {
    it('clears all entries for a DB on mutation', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 60);
      cache.set('db1', 'SELECT 2', [], fakeResult, 60);
      cache.invalidate('db1');
      expect(cache.get('db1', 'SELECT 1', [])).toBeUndefined();
      expect(cache.get('db1', 'SELECT 2', [])).toBeUndefined();
    });
    it('does not affect other DBs', () => {
      cache.set('db1', 'SELECT 1', [], fakeResult, 60);
      cache.set('db2', 'SELECT 1', [], fakeResult, 60);
      cache.invalidate('db1');
      expect(cache.get('db2', 'SELECT 1', [])).toEqual(fakeResult);
    });
  });

  describe('shouldCache', () => {
    it('returns true for SELECT', () => {
      expect(cache.shouldCache('SELECT * FROM foo')).toBe(true);
    });
    it('returns false for INSERT', () => {
      expect(cache.shouldCache('INSERT INTO foo VALUES (1)')).toBe(false);
    });
    it('returns false for UPDATE', () => {
      expect(cache.shouldCache('UPDATE foo SET bar = 1')).toBe(false);
    });
    it('returns false for non-deterministic SELECT', () => {
      expect(cache.shouldCache('SELECT RAND()')).toBe(false);
    });
  });
});
