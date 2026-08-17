/**
 * tests/state.test.js: the poll bookkeeping rules. These are the ones that
 * decide whether a user gets interrupted, so they get the most cases.
 */
import { describe, it, expect } from 'vitest';
import {
  activeOnly, visibleAlerts, newAlerts, pruneIds, addId, removeId,
} from '../lib/state.js';

const A = (id, extra = {}) => ({ id, title: id, severity: 'info', ...extra });

describe('activeOnly', () => {
  it('drops active:false, keeps true and missing', () => {
    const out = activeOnly([A('a', { active: true }), A('b', { active: false }), A('c')]);
    expect(out.map(a => a.id)).toEqual(['a', 'c']);
  });
  it('tolerates junk', () => {
    expect(activeOnly(null)).toEqual([]);
    expect(activeOnly([null, undefined, A('x')])).toHaveLength(1);
  });
});

describe('visibleAlerts', () => {
  it('hides dismissed IDs', () => {
    const out = visibleAlerts([A('a'), A('b'), A('c')], ['b']);
    expect(out.map(a => a.id)).toEqual(['a', 'c']);
  });
  it('treats missing dismissed list as empty', () => {
    expect(visibleAlerts([A('a')], undefined)).toHaveLength(1);
  });
});

describe('newAlerts: when do we interrupt?', () => {
  it('first poll: everything visible is new', () => {
    expect(newAlerts([A('a'), A('b')], [], []).map(a => a.id)).toEqual(['a', 'b']);
  });
  it('unchanged set: nothing is new', () => {
    expect(newAlerts([A('a'), A('b')], ['a', 'b'], [])).toEqual([]);
  });
  it('one added: only the added one is new', () => {
    expect(newAlerts([A('a'), A('b'), A('c')], ['a', 'b'], []).map(a => a.id)).toEqual(['c']);
  });
  it('silenced alerts never count as new even if unseen', () => {
    expect(newAlerts([A('a'), A('b')], [], ['b']).map(a => a.id)).toEqual(['a']);
  });
  it('an alert that vanished and came back is new again', () => {
    // poll 1: a,b   poll 2: a   poll 3: a,b  → b re-fires on poll 3
    const poll3 = newAlerts([A('a'), A('b')], ['a'], []);
    expect(poll3.map(a => a.id)).toEqual(['b']);
  });
  it('a dismissed-but-still-active alert is not new (it is not visible)', () => {
    const visible = visibleAlerts([A('a'), A('b')], ['b']);
    expect(newAlerts(visible, ['a'], []).map(a => a.id)).toEqual([]);
  });
});

describe('pruneIds', () => {
  it('drops IDs no longer active', () => {
    expect(pruneIds(['a', 'b', 'c'], [A('a'), A('c')])).toEqual(['a', 'c']);
  });
  it('returns the SAME array when nothing changes (lets caller skip a write)', () => {
    const ids = ['a', 'b'];
    expect(pruneIds(ids, [A('a'), A('b'), A('z')])).toBe(ids);
  });
  it('handles undefined', () => {
    expect(pruneIds(undefined, [A('a')])).toEqual([]);
  });
});

describe('addId / removeId', () => {
  it('addId is idempotent', () => {
    const once = addId([], 'x');
    expect(once).toEqual(['x']);
    expect(addId(once, 'x')).toBe(once);
  });
  it('removeId returns a new array without the id', () => {
    expect(removeId(['a', 'b'], 'a')).toEqual(['b']);
    expect(removeId(undefined, 'a')).toEqual([]);
  });
});
