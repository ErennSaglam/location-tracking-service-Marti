import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Last processed location per user. Its row lock serializes concurrent
// updates of the same user.
@Entity({ name: 'user_location_states' })
export class UserLocationState {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 128 })
  userId: string;

  // NULL until the first location for this user has been processed.
  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({
    name: 'current_area_ids',
    type: 'integer',
    array: true,
    default: () => "'{}'",
  })
  currentAreaIds: number[];

  @Column({ name: 'last_timestamp', type: 'timestamptz', nullable: true })
  lastTimestamp: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
