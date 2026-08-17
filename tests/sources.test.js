/**
 * tests/sources.test.js — the adapters, run against real captured payloads in
 * tests/fixtures/ (captured 2026-08-17 from the live APIs; geometry stripped
 * from the NWS one to keep it small). Plus the registry invariants that catch
 * the classic "forgot host_permissions" mistake at test time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeNws, buildUrl } from '../sources/nws.js';
import { normalizeStatuspage } from '../sources/githubstatus.js';
import * as mock from '../sources/mock.js';
import { SOURCES, getSource, DEFAULT_SOURCE_ID, defaultSettingsFor } from '../sources/index.js';
import { makeAlert } from '../sources/types.js';
import { SEVERITY_ORDER } from '../lib/severity.js';

// Paths are relative to the vitest root (the repo), not import.meta.url —
// under the jsdom environment import.meta.url is not a file: URL.
const fixture = name => JSON.parse(readFileSync(resolve('tests/fixtures', name), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve('manifest.json'), 'utf8'));

const ALERT_KEYS = ['id', 'title', 'message', 'severity', 'active', 'startTime', 'endTime', 'url'];
function expectAlertShape(a) {
  expect(Object.keys(a).sort()).toEqual([...ALERT_KEYS].sort());
  expect(typeof a.id).toBe('string');
  expect(a.id.length).toBeGreaterThan(0);
  expect(typeof a.title).toBe('string');
  expect(SEVERITY_ORDER).toContain(a.severity);
  expect(typeof a.active).toBe('boolean');
}

describe('makeAlert', () => {
  it('fills safe defaults', () => {
    const a = makeAlert({ id: 1 });
    expectAlertShape(a);
    expect(a).toMatchObject({ id: '1', title: 'Untitled alert', message: '', severity: 'info', active: true, startTime: null, endTime: null, url: null });
  });
  it('respects active:false', () => {
    expect(makeAlert({ id: 'x', active: false }).active).toBe(false);
  });
});

describe('NWS adapter', () => {
  // The fixture's alerts end 2026-08-21; pin "now" inside their window.
  const NOW = new Date('2026-08-17T20:00:00Z');
  const raw = fixture('nws-az.json');

  it('collapses per-zone duplicates of the same event into one alert', () => {
    expect(raw.features.length).toBeGreaterThan(1); // 6 at capture time
    const out = normalizeNws(raw, NOW);
    expect(out.length).toBeLessThan(raw.features.length);
    // Every distinct (event, severity, ends) becomes exactly one alert
    const keys = new Set(raw.features.map(f => `${f.properties.event}|${f.properties.severity}|${f.properties.ends || f.properties.expires}`));
    expect(out).toHaveLength(keys.size);
  });

  it('produces well-formed alerts with the NWS severity mapped', () => {
    const out = normalizeNws(raw, NOW);
    for (const a of out) expectAlertShape(a);
    // Fixture is all "Severe" → serious
    expect(out.every(a => a.severity === 'serious')).toBe(true);
    expect(out[0].title).toBe('Extreme Heat Warning');
    expect(out[0].message).toMatch(/Areas:/);
    expect(out[0].id).toMatch(/^nws:/);
    expect(out[0].endTime).toBeTruthy();
  });

  it('IDs are stable across calls (dismiss/silence depend on this)', () => {
    const a = normalizeNws(raw, NOW).map(x => x.id);
    const b = normalizeNws(structuredClone(raw), NOW).map(x => x.id);
    expect(a).toEqual(b);
  });

  it('maps every NWS severity word onto our scale', () => {
    const mk = (severity, event) => ({
      properties: { status: 'Actual', messageType: 'Alert', severity, event, ends: '2099-01-01T00:00:00Z' },
    });
    const out = normalizeNws({ features: [
      mk('Extreme', 'A'), mk('Severe', 'B'), mk('Moderate', 'C'), mk('Minor', 'D'), mk('Unknown', 'E'), mk('Weird', 'F'),
    ] }, NOW);
    expect(out.map(a => a.severity)).toEqual(['critical', 'serious', 'warning', 'info', 'info', 'info']);
  });

  it('skips tests, cancels and expired alerts', () => {
    const base = { severity: 'Severe', event: 'X', ends: '2099-01-01T00:00:00Z' };
    const out = normalizeNws({ features: [
      { properties: { ...base, status: 'Test', messageType: 'Alert' } },
      { properties: { ...base, status: 'Actual', messageType: 'Cancel' } },
      { properties: { ...base, status: 'Actual', messageType: 'Alert', ends: '2000-01-01T00:00:00Z' } },
      { properties: { ...base, status: 'Actual', messageType: 'Alert' } },
    ] }, NOW);
    expect(out).toHaveLength(1);
  });

  it('buildUrl: nationwide omits ?area, severity is passed through', () => {
    expect(buildUrl({})).toBe('https://api.weather.gov/alerts/active?severity=Extreme%2CSevere');
    expect(buildUrl({ area: '', severity: 'Extreme,Severe' })).toBe('https://api.weather.gov/alerts/active?severity=Extreme%2CSevere');
    expect(buildUrl({ area: 'az', severity: 'Extreme,Severe,Moderate,Minor,Unknown' }))
      .toBe('https://api.weather.gov/alerts/active?area=AZ&severity=Extreme%2CSevere%2CModerate%2CMinor%2CUnknown');
  });

  it('names the issuing offices in the message', () => {
    const out = normalizeNws(raw, NOW);
    expect(out[0].message).toMatch(/Issued by NWS/);
  });

  it('tolerates an empty or malformed payload', () => {
    expect(normalizeNws({}, NOW)).toEqual([]);
    expect(normalizeNws(null, NOW)).toEqual([]);
    expect(normalizeNws({ features: [{}, { properties: null }] }, NOW)).toEqual([]);
  });
});

describe('GitHub Status adapter', () => {
  const raw = fixture('githubstatus-unresolved.json');

  it('normalises the captured incident', () => {
    const out = normalizeStatuspage(raw);
    expect(out).toHaveLength(raw.incidents.length);
    for (const a of out) expectAlertShape(a);
    const first = out[0];
    expect(first.id).toBe(`ghs:${raw.incidents[0].id}`);
    expect(first.title).toBe(raw.incidents[0].name);
    expect(first.active).toBe(true);
    expect(first.url).toMatch(/^https:\/\//);
    expect(first.message).toMatch(/Status:/);
  });

  it('maps impact → severity', () => {
    const mk = (impact, id) => ({ id, name: id, impact, status: 'investigating', incident_updates: [] });
    const out = normalizeStatuspage({ incidents: [mk('critical', 'a'), mk('major', 'b'), mk('minor', 'c'), mk('none', 'd'), mk('??', 'e')] });
    expect(out.map(a => a.severity)).toEqual(['critical', 'serious', 'warning', 'info', 'info']);
  });

  it('marks resolved incidents inactive (so /incidents.json would also work)', () => {
    const out = normalizeStatuspage({ incidents: [
      { id: 'r', name: 'r', impact: 'major', status: 'resolved', resolved_at: '2026-01-01T00:00:00Z', incident_updates: [] },
      { id: 'p', name: 'p', impact: 'major', status: 'postmortem', incident_updates: [] },
    ] });
    expect(out.map(a => a.active)).toEqual([false, false]);
  });

  it('tolerates an empty payload', () => {
    expect(normalizeStatuspage({})).toEqual([]);
    expect(normalizeStatuspage(undefined)).toEqual([]);
  });
});

describe('mock adapter', () => {
  it('returns one active alert per severity plus one inactive', async () => {
    const out = await mock.fetchAlerts({}, new Date('2026-08-17T12:00:00Z'));
    for (const a of out) expectAlertShape(a);
    const active = out.filter(a => a.active);
    expect(new Set(active.map(a => a.severity))).toEqual(new Set(SEVERITY_ORDER));
    expect(out.filter(a => !a.active)).toHaveLength(1);
  });
  it('is deterministic for a fixed clock', async () => {
    const t = new Date('2026-08-17T12:00:00Z');
    expect(await mock.fetchAlerts({}, t)).toEqual(await mock.fetchAlerts({}, t));
  });
});

describe('source registry', () => {
  it('has unique IDs and the default is registered', () => {
    const ids = SOURCES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_SOURCE_ID);
  });
  it('every source implements the contract', () => {
    for (const s of SOURCES) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.label).toBe('string');
      expect(typeof s.description).toBe('string');
      expect(Array.isArray(s.hosts)).toBe(true);
      expect(typeof s.fetchAlerts).toBe('function');
    }
  });
  it('every source host is declared in manifest.json host_permissions', () => {
    // Forgetting this yields a runtime "Failed to fetch" with no other clue.
    for (const s of SOURCES) for (const h of s.hosts) {
      expect(manifest.host_permissions, `${s.id} host ${h}`).toContain(h);
    }
  });
  it('getSource falls back to the default for unknown IDs', () => {
    expect(getSource('nope').id).toBe(DEFAULT_SOURCE_ID);
    expect(getSource(undefined).id).toBe(DEFAULT_SOURCE_ID);
  });
  it('defaultSettingsFor reads each declared default', () => {
    expect(defaultSettingsFor(getSource('nws'))).toEqual({ area: '', severity: 'Extreme,Severe' });
    expect(defaultSettingsFor(getSource('mock'))).toEqual({});
  });
  it('per-source select settings have their default among their options', () => {
    for (const s of SOURCES) for (const d of s.settings || []) {
      if (d.type === 'select') expect(d.options.map(o => o.value)).toContain(d.default);
    }
  });
});
