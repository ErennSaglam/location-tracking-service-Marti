import {
  Column,
  CreateDateColumn,
  Entity,
  type Polygon,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'areas' })
export class Area {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  // Stored as PostGIS geometry; TypeORM reads and writes it as GeoJSON.
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  polygon: Polygon;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
