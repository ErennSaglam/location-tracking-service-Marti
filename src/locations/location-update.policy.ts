// Pure decision rules for POST /locations, kept free of I/O for unit testing.

export interface LastKnownLocation {
  latitude: number | null;
  longitude: number | null;
  lastTimestamp: Date | null;
}

export interface IncomingLocation {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export type UpdateClassification =
  | 'apply' // newer than anything processed for this user
  | 'stale' // older than the last processed location (out-of-order delivery)
  | 'duplicate' // same timestamp and coordinates (client retry)
  | 'conflict'; // same timestamp, different coordinates

export function classifyUpdate(
  last: LastKnownLocation,
  incoming: IncomingLocation,
): UpdateClassification {
  if (last.lastTimestamp === null) return 'apply';

  const lastMs = last.lastTimestamp.getTime();
  const incomingMs = incoming.timestamp.getTime();
  if (incomingMs > lastMs) return 'apply';
  if (incomingMs < lastMs) return 'stale';

  return last.latitude === incoming.latitude &&
    last.longitude === incoming.longitude
    ? 'duplicate'
    : 'conflict';
}

// Areas the user is in now but was not in at the previous location.
export function enteredAreaIds(
  previous: number[],
  current: number[],
): number[] {
  const before = new Set(previous);
  return current.filter((id) => !before.has(id));
}
