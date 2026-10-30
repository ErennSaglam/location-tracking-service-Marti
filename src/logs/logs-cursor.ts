import { BadRequestException } from '@nestjs/common';

// Keyset position in the (entry_time DESC, id DESC) order. Opaque to clients.
export interface LogsCursor {
  entryTime: Date;
  id: string;
}

export function encodeCursor(cursor: LogsCursor): string {
  return Buffer.from(`${cursor.entryTime.toISOString()}|${cursor.id}`).toString(
    'base64url',
  );
}

const MAX_BIGINT = 9_223_372_036_854_775_807n;

export function decodeCursor(value: string): LogsCursor {
  const [time, id] = Buffer.from(value, 'base64url').toString().split('|');
  const entryTime = new Date(time);
  // Bounds keep a forged cursor from reaching PostgreSQL with a value outside
  // the timestamptz / bigint range (which would fail there).
  const year = entryTime.getUTCFullYear();
  if (
    Number.isNaN(entryTime.getTime()) ||
    year < 1 ||
    year > 9999 ||
    !/^\d{1,19}$/.test(id ?? '') ||
    BigInt(id) > MAX_BIGINT
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  return { entryTime, id };
}
