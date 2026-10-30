import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Area } from './area.entity.js';

@Entity({ name: 'area_entry_logs' })
export class AreaEntryLog {
  // bigint is returned by pg as a string to avoid precision loss.
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 128 })
  userId: string;

  @Column({ name: 'area_id', type: 'integer' })
  areaId: number;

  @ManyToOne(() => Area)
  @JoinColumn({ name: 'area_id' })
  area?: Area;

  // Device timestamp of the location that entered the area.
  @Column({ name: 'entry_time', type: 'timestamptz' })
  entryTime: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
