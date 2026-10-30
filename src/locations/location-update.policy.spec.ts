import {
  classifyUpdate,
  enteredAreaIds,
  type LastKnownLocation,
} from './location-update.policy.js';

const T = new Date('2026-01-01T09:00:00.000Z');
const later = new Date(T.getTime() + 5_000);
const earlier = new Date(T.getTime() - 5_000);

const last: LastKnownLocation = {
  latitude: 41.0,
  longitude: 29.0,
  lastTimestamp: T,
};

describe('classifyUpdate', () => {
  it('applies the first location of a user', () => {
    const fresh = { latitude: null, longitude: null, lastTimestamp: null };
    expect(
      classifyUpdate(fresh, { latitude: 41, longitude: 29, timestamp: T }),
    ).toBe('apply');
  });

  it.each([
    ['apply', later, 41.5, 29.5],
    ['stale', earlier, 41.5, 29.5],
    ['duplicate', T, 41.0, 29.0],
    ['conflict', T, 41.5, 29.0],
  ] as const)('returns %s', (expected, timestamp, latitude, longitude) => {
    expect(classifyUpdate(last, { latitude, longitude, timestamp })).toBe(
      expected,
    );
  });
});

describe('enteredAreaIds', () => {
  it('returns only areas that were not occupied before', () => {
    expect(enteredAreaIds([1, 2], [2, 3, 4])).toEqual([3, 4]);
  });

  it('returns nothing while the user stays in the same areas', () => {
    expect(enteredAreaIds([1, 2], [1, 2])).toEqual([]);
  });

  it('returns nothing when the user leaves areas', () => {
    expect(enteredAreaIds([1, 2], [])).toEqual([]);
  });
});
