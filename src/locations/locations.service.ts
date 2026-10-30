import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import {
  classifyUpdate,
  enteredAreaIds,
  type IncomingLocation,
  type LastKnownLocation,
} from './location-update.policy.js';

interface LockedState extends LastKnownLocation {
  currentAreaIds: number[];
  areaIdsAtIncoming: number[];
}

// A future timestamp would make every later real update look stale, so only
// a small clock skew between device and server is tolerated.
const MAX_CLOCK_SKEW_MS = 60_000;

export type LocationProcessingStatus =
  'processed' | 'stale_ignored' | 'duplicate_ignored';

export interface LocationProcessingResult {
  status: LocationProcessingStatus;
  enteredAreaIds: number[];
  currentAreaIds: number[];
}

@Injectable()
export class LocationsService {
  constructor(private readonly dataSource: DataSource) {}

  async process(
    createLocationDto: CreateLocationDto,
  ): Promise<LocationProcessingResult> {
    const incoming: IncomingLocation = {
      latitude: createLocationDto.latitude,
      longitude: createLocationDto.longitude,
      timestamp: new Date(createLocationDto.timestamp),
    };
    if (incoming.timestamp.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
      throw new BadRequestException('timestamp is in the future');
    }

    // Raw SQL keeps the hot path at 4 round trips (BEGIN, lock + area lookup,
    // write, COMMIT); the row lock and pool connection are held that long.
    return this.dataSource.transaction(async (manager) => {
      // Lock the user's row: concurrent requests for the same user queue
      // here, requests for different users do not block each other.
      let state = await this.lockStateAndFindAreas(
        manager,
        createLocationDto.userId,
        incoming,
      );
      if (!state) {
        await manager.query(
          `INSERT INTO user_location_states (user_id) VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING`,
          [createLocationDto.userId],
        );
        state = await this.lockStateAndFindAreas(
          manager,
          createLocationDto.userId,
          incoming,
        );
      }
      // Not expected: the row was inserted (or already existed) just above.
      // Answered as a retryable 503 rather than an unhandled 500.
      if (!state) {
        throw new ServiceUnavailableException(
          'Location could not be processed, please retry',
        );
      }

      switch (classifyUpdate(state, incoming)) {
        case 'stale':
          return this.ignored('stale_ignored', state);
        case 'duplicate':
          return this.ignored('duplicate_ignored', state);
        case 'conflict':
          throw new ConflictException(
            'A different location was already recorded for this user at this timestamp',
          );
      }

      const currentAreaIds = state.areaIdsAtIncoming;
      const entered = enteredAreaIds(state.currentAreaIds, currentAreaIds);

      // One statement writes the entry logs (if any) and the new state. The
      // unique key makes a replayed entry a no-op instead of a duplicate log.
      await manager.query(
        `WITH entry_logs AS (
           INSERT INTO area_entry_logs (user_id, area_id, entry_time)
           SELECT $1, area_id, $3 FROM unnest($2::int[]) AS area_id
           ON CONFLICT (user_id, area_id, entry_time) DO NOTHING
         )
         UPDATE user_location_states
         SET latitude = $4, longitude = $5, current_area_ids = $6,
             last_timestamp = $3, updated_at = now()
         WHERE user_id = $1`,
        [
          createLocationDto.userId,
          entered,
          incoming.timestamp,
          incoming.latitude,
          incoming.longitude,
          currentAreaIds,
        ],
      );

      return { status: 'processed', enteredAreaIds: entered, currentAreaIds };
    });
  }

  // Locks the state row and, in the same round trip, finds the areas that
  // cover the incoming point (GiST index). Returns undefined for a new user.
  private async lockStateAndFindAreas(
    manager: EntityManager,
    userId: string,
    incoming: IncomingLocation,
  ): Promise<LockedState | undefined> {
    const rows = await manager.query<LockedState[]>(
      `SELECT s.latitude, s.longitude,
              s.current_area_ids AS "currentAreaIds",
              s.last_timestamp AS "lastTimestamp",
              ARRAY(
                SELECT a.id FROM areas a
                WHERE ST_Covers(a.polygon, ST_SetSRID(ST_MakePoint($2, $3), 4326))
                ORDER BY a.id
              ) AS "areaIdsAtIncoming"
       FROM user_location_states s
       WHERE s.user_id = $1
       FOR UPDATE OF s`,
      [userId, incoming.longitude, incoming.latitude],
    );
    return rows[0];
  }

  private ignored(
    status: LocationProcessingStatus,
    state: LockedState,
  ): LocationProcessingResult {
    return {
      status,
      enteredAreaIds: [],
      currentAreaIds: state.currentAreaIds,
    };
  }
}
