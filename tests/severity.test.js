/**
 * tests/severity.test.js — the four-level scale and its helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  SEVERITY_ORDER, SEVERITY_COLORS, SEVERITY_LABELS, INTERRUPTIVE_SEVERITIES,
  normalizeSeverity, atLeast, highestSeverity, sortBySeverity,
} from '../lib/severity.js';

describe('severity scale', () => {
  it('has exactly four levels, most severe first', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'serious', 'warning', 'info']);
  });

  it('every level has a colour and a label', () => {
    for (const s of SEVERITY_ORDER) {
      expect(SEVERITY_COLORS[s]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(SEVERITY_LABELS[s]).toBe(s.toUpperCase());
    }
  });

  it('interruptive levels are the top two', () => {
    expect([...INTERRUPTIVE_SEVERITIES].sort()).toEqual(['critical', 'serious']);
  });
});

describe('normalizeSeverity', () => {
  it('passes known levels through, case/space-insensitively', () => {
    expect(normalizeSeverity('critical')).toBe('critical');
    expect(normalizeSeverity(' Serious ')).toBe('serious');
    expect(normalizeSeverity('WARNING')).toBe('warning');
  });
  it('maps anything unknown to info without throwing', () => {
    expect(normalizeSeverity('extreme')).toBe('info');
    expect(normalizeSeverity(undefined)).toBe('info');
    expect(normalizeSeverity(null)).toBe('info');
    expect(normalizeSeverity(42)).toBe('info');
    expect(normalizeSeverity({})).toBe('info');
  });
});

describe('atLeast', () => {
  it('compares by rank', () => {
    expect(atLeast('critical', 'info')).toBe(true);
    expect(atLeast('warning', 'warning')).toBe(true);
    expect(atLeast('info', 'warning')).toBe(false);
  });
  it('treats unknown as info', () => {
    expect(atLeast('bogus', 'info')).toBe(true);
    expect(atLeast('bogus', 'warning')).toBe(false);
  });
});

describe('highestSeverity', () => {
  it('returns null for empty input', () => {
    expect(highestSeverity([])).toBeNull();
    expect(highestSeverity(undefined)).toBeNull();
  });
  it('finds the worst regardless of order', () => {
    expect(highestSeverity([{ severity: 'info' }, { severity: 'serious' }, { severity: 'warning' }])).toBe('serious');
    expect(highestSeverity([{ severity: 'info' }])).toBe('info');
    expect(highestSeverity([{ severity: 'info' }, { severity: 'critical' }])).toBe('critical');
  });
});

describe('sortBySeverity', () => {
  it('sorts most severe first and is stable', () => {
    const input = [
      { id: 1, severity: 'info' }, { id: 2, severity: 'critical' },
      { id: 3, severity: 'warning' }, { id: 4, severity: 'critical' }, { id: 5, severity: 'serious' },
    ];
    expect(sortBySeverity(input).map(a => a.id)).toEqual([2, 4, 5, 3, 1]);
  });
  it('does not mutate its input', () => {
    const input = [{ severity: 'info' }, { severity: 'critical' }];
    const copy = [...input];
    sortBySeverity(input);
    expect(input).toEqual(copy);
  });
});
