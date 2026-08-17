/**
 * tests/format.test.js — text helpers, with emphasis on the escaping that
 * keeps feed content from becoming markup.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, paragraphsHtml, relativeTime, longTime } from '../lib/format.js';

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  });
  it('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('paragraphsHtml', () => {
  it('splits on blank lines and rejoins hard wraps', () => {
    const nws = '* WHAT...Dangerously hot\nconditions.\n\n* WHERE...Portions of\nArizona.';
    expect(paragraphsHtml(nws)).toBe('<p>* WHAT...Dangerously hot conditions.</p><p>* WHERE...Portions of Arizona.</p>');
  });
  it('never lets feed markup through', () => {
    expect(paragraphsHtml('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
  it('returns empty string for empty input', () => {
    expect(paragraphsHtml('')).toBe('');
    expect(paragraphsHtml(undefined)).toBe('');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-17T12:00:00Z');
  it('describes past and future', () => {
    expect(relativeTime('2026-08-17T11:58:00Z', now)).toMatch(/2 minutes ago/);
    expect(relativeTime('2026-08-17T14:00:00Z', now)).toMatch(/in 2 hours/);
  });
  it('falls back to a date beyond ~2 days', () => {
    expect(relativeTime('2026-08-25T12:00:00Z', now)).toMatch(/2026|Aug/);
  });
  it('returns empty for garbage', () => {
    expect(relativeTime('nope', now)).toBe('');
    expect(longTime('nope')).toBe('');
  });
});
