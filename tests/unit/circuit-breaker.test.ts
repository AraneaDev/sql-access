import {
  initialCircuitState,
  shouldReject,
  recordFailure,
  recordSuccess,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
  CIRCUIT_WINDOW_MS,
} from '../../src/utils/circuit-breaker.js';

describe('circuit breaker state machine', () => {
  describe('CLOSED state', () => {
    it('starts CLOSED with 0 failures', () => {
      const s = initialCircuitState();
      expect(s.status).toBe('CLOSED');
      expect(s.failures).toBe(0);
    });
    it('stays CLOSED below failure threshold', () => {
      let s = initialCircuitState();
      const now = Date.now();
      for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD - 1; i++) s = recordFailure(s, now);
      expect(s.status).toBe('CLOSED');
    });
    it('transitions CLOSED → OPEN at threshold', () => {
      let s = initialCircuitState();
      const now = Date.now();
      for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) s = recordFailure(s, now);
      expect(s.status).toBe('OPEN');
      expect(s.openedAt).toBe(now);
    });
    it('resets failure count when window expires', () => {
      let s = initialCircuitState();
      const t0 = 1000;
      s = recordFailure(s, t0);
      s = recordFailure(s, t0 + CIRCUIT_WINDOW_MS + 1);
      expect(s.failures).toBe(1);
    });
  });

  describe('OPEN state', () => {
    function openState(now: number) {
      let s = initialCircuitState();
      for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) s = recordFailure(s, now);
      return s;
    }
    it('shouldReject returns true while OPEN and cooldown not elapsed', () => {
      const now = 10_000;
      const s = openState(now);
      const r = shouldReject(s, now + CIRCUIT_COOLDOWN_MS - 1);
      expect(r.reject).toBe(true);
      expect((r as { reject: true; retryInMs: number }).retryInMs).toBeGreaterThan(0);
    });
    it('shouldReject returns false (probe allowed) after cooldown → HALF_OPEN', () => {
      const now = 10_000;
      const s = openState(now);
      const r = shouldReject(s, now + CIRCUIT_COOLDOWN_MS + 1);
      expect(r.reject).toBe(false);
      expect((r as { reject: false; transitionTo?: string }).transitionTo).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    it('transitions HALF_OPEN → CLOSED on success', () => {
      let s = initialCircuitState();
      s = { ...s, status: 'HALF_OPEN', openedAt: Date.now() };
      s = recordSuccess(s);
      expect(s.status).toBe('CLOSED');
      expect(s.failures).toBe(0);
      expect(s.openedAt).toBeNull();
    });
    it('transitions HALF_OPEN → OPEN on failure', () => {
      const now = Date.now();
      let s = initialCircuitState();
      s = { ...s, status: 'HALF_OPEN', openedAt: now };
      s = recordFailure(s, now + 1);
      expect(s.status).toBe('OPEN');
      expect(s.openedAt).toBe(now + 1);
    });
  });
});
