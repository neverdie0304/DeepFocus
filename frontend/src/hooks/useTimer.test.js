/**
 * useTimer tests.
 *
 * The whole point of the wall-clock rewrite is that elapsed time is
 * computed from ``Date.now()``, not from counting interval ticks. The
 * tests therefore drive the clock with vitest fake timers and verify
 * that the reported elapsed time tracks wall time even when the tick
 * frequency is artificially low (the throttled-background-tab case).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import useTimer from './useTimer';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state with zero elapsed', () => {
    const { result } = renderHook(() => useTimer());
    expect(result.current.status).toBe('idle');
    expect(result.current.elapsed).toBe(0);
    expect(result.current.getElapsed()).toBe(0);
  });

  it('reports elapsed seconds when running', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    expect(result.current.status).toBe('running');

    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.elapsed).toBe(5);
    expect(result.current.getElapsed()).toBe(5);
  });

  it('survives throttled ticks: getElapsed reports wall time even when no tick fired', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());

    // Simulate an aggressively throttled background tab: the wall
    // clock jumps 60 seconds forward but the setInterval callback
    // never fires (Chrome reduces hidden-tab intervals to roughly
    // 1/min). With the old setInterval-counting impl elapsed would
    // not advance at all; with the wall-clock impl getElapsed reports
    // the true 60 seconds the moment it is called.
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    });

    expect(result.current.getElapsed()).toBe(60);
  });

  it('catches up on next tick after a long throttled spell', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());

    // Wall clock jumps 60s with no ticks, then a single tick fires.
    // The state-bound elapsed should reflect the full 60s (plus the
    // 1s the firing tick advances), not just one incremented count.
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current.elapsed).toBe(61);
  });

  it('pauses and excludes paused time from elapsed', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.getElapsed()).toBe(10);

    act(() => result.current.pause());
    expect(result.current.status).toBe('paused');

    // 30 seconds pass while paused — should NOT be counted.
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.getElapsed()).toBe(10);
  });

  it('resumes and continues accumulating from where it left off', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(10_000));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(30_000));  // pause window
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(7_000));

    expect(result.current.getElapsed()).toBe(17);  // 10 + 7, not + 30
  });

  it('handles multiple pause/resume cycles correctly', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(5_000));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(60_000));  // long pause
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(3_000));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(60_000));  // another long pause
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(2_000));

    expect(result.current.getElapsed()).toBe(10);  // 5 + 3 + 2
  });

  it('stop() finalises elapsed using wall-clock time at the call', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(8_000));
    act(() => result.current.stop());

    expect(result.current.status).toBe('idle');
    expect(result.current.elapsed).toBe(8);
    expect(result.current.getElapsed()).toBe(8);
  });

  it('stop() returns up-to-date elapsed even if no tick fired since start', () => {
    // This is the endSession-after-throttled-background scenario:
    // the user clicks End while the background-throttled timer has
    // not fired a tick recently. getElapsed must still return the
    // correct wall-clock total.
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T01:00:00Z')); // +1h
      // Deliberately do not advance fake timers — simulate that no
      // tick fired during the entire hour.
    });

    expect(result.current.getElapsed()).toBe(3600);
  });

  it('reset() clears elapsed and returns timer to idle', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(5_000));
    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.elapsed).toBe(0);
    expect(result.current.getElapsed()).toBe(0);
  });

  it('start() after reset begins from zero', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(5_000));
    act(() => result.current.reset());
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3_000));

    expect(result.current.getElapsed()).toBe(3);
  });

  it('idempotent start: calling start() twice does not double the rate', () => {
    const { result } = renderHook(() => useTimer());

    act(() => result.current.start());
    act(() => result.current.start());  // should be a no-op
    act(() => vi.advanceTimersByTime(5_000));

    expect(result.current.getElapsed()).toBe(5);
  });
});
