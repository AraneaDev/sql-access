export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_WINDOW_MS = 60_000;
export const CIRCUIT_COOLDOWN_MS = 30_000;

export type CircuitStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  status: CircuitStatus;
  failures: number;
  windowStart: number;
  openedAt: number | null;
}

export function initialCircuitState(): CircuitBreakerState {
  return { status: 'CLOSED', failures: 0, windowStart: Date.now(), openedAt: null };
}

export interface RejectResult {
  reject: true;
  retryInMs: number;
}
export interface AllowResult {
  reject: false;
  transitionTo?: 'HALF_OPEN';
}

export function shouldReject(state: CircuitBreakerState, now: number): RejectResult | AllowResult {
  if (state.status === 'CLOSED') return { reject: false };
  if (state.status === 'HALF_OPEN') return { reject: false };
  const elapsed = now - (state.openedAt ?? now);
  if (elapsed >= CIRCUIT_COOLDOWN_MS) return { reject: false, transitionTo: 'HALF_OPEN' };
  return { reject: true, retryInMs: CIRCUIT_COOLDOWN_MS - elapsed };
}

export function recordFailure(state: CircuitBreakerState, now: number): CircuitBreakerState {
  // Anchor windowStart to first recorded failure if it hasn't been set by a prior failure
  const effectiveWindowStart = state.failures === 0 ? now : state.windowStart;
  const windowExpired = state.failures > 0 && now - effectiveWindowStart > CIRCUIT_WINDOW_MS;
  const base: CircuitBreakerState = windowExpired
    ? { status: 'CLOSED', failures: 0, windowStart: now, openedAt: null }
    : { ...state, windowStart: effectiveWindowStart };
  if (base.status === 'HALF_OPEN')
    return { status: 'OPEN', failures: 1, windowStart: now, openedAt: now };
  const failures = base.failures + 1;
  if (failures >= CIRCUIT_FAILURE_THRESHOLD)
    return { status: 'OPEN', failures, windowStart: base.windowStart, openedAt: now };
  return { ...base, failures };
}

export function recordSuccess(state: CircuitBreakerState): CircuitBreakerState {
  if (state.status === 'HALF_OPEN' || state.status === 'OPEN')
    return { status: 'CLOSED', failures: 0, windowStart: Date.now(), openedAt: null };
  return { ...state, failures: 0 };
}
