import { describe, expect, it } from 'vitest';
import { clock, count, currency, delta, duration, percent, seconds, utcTimestamp, DASH } from '../lib/format';
import { normalizePath, isKnownPath } from '../routes';

describe('format', () => {
  it('formats durations', () => {
    expect(duration(1635)).toBe('27 h 15 min');
    expect(duration(45)).toBe('45 min');
    expect(duration(120)).toBe('2 h');
    expect(duration(undefined)).toBe(DASH);
  });
  it('formats money, percent, counts and clocks', () => {
    expect(currency(9773)).toBe('$9,773');
    expect(percent(14.44)).toBe('14.4%');
    expect(percent(12)).toBe('12%');
    expect(count(1204)).toBe('1,204');
    expect(clock(510)).toBe('08:30');
    expect(clock(1440)).toBe('24:00');
    expect(seconds(0.1234)).toBe('0.123 s');
    expect(delta(2)).toBe('+2');
    expect(delta(null)).toBe(DASH);
  });
  it('formats UTC timestamps and never invents values', () => {
    expect(utcTimestamp('2026-10-14T15:36:02')).toBe('2026-10-14 15:36:02 UTC');
    expect(utcTimestamp(null)).toBe(DASH);
    expect(percent(Number.NaN)).toBe(DASH);
  });
});

describe('routes', () => {
  it('redirects legacy paths under /console', () => {
    expect(normalizePath('/fleet')).toBe('/console/fleet');
    expect(normalizePath('/mission')).toBe('/');
    expect(normalizePath('/console/tasks/')).toBe('/console/tasks');
    expect(isKnownPath('/console/benchmarks')).toBe(true);
    expect(isKnownPath('/console/nope')).toBe(false);
  });
});
