import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792916810000 implements MigrationInterface {
  name = 'InitialSchema1792916810000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    await queryRunner.query(`
      CREATE TABLE areas (
        id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name        varchar(100) NOT NULL,
        polygon     geometry(Polygon, 4326) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_areas_name UNIQUE (name),
        CONSTRAINT chk_areas_polygon_valid CHECK (ST_IsValid(polygon))
      )
    `);
    // Point-in-polygon lookups on every location update rely on this index.
    await queryRunner.query(
      `CREATE INDEX idx_areas_polygon ON areas USING GIST (polygon)`,
    );

    // One row per user: the last processed location and the areas the user
    // is currently inside. Locked with SELECT ... FOR UPDATE per request.
    await queryRunner.query(`
      CREATE TABLE user_location_states (
        user_id           varchar(128) PRIMARY KEY,
        latitude          double precision NULL,
        longitude         double precision NULL,
        current_area_ids  integer[] NOT NULL DEFAULT '{}',
        last_timestamp    timestamptz NULL,
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE area_entry_logs (
        id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id     varchar(128) NOT NULL,
        area_id     integer NOT NULL,
        entry_time  timestamptz NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_area_entry_logs_area
          FOREIGN KEY (area_id) REFERENCES areas (id),
        CONSTRAINT uq_area_entry_logs_user_area_time
          UNIQUE (user_id, area_id, entry_time)
      )
    `);
    // Keyset pagination for GET /logs: unfiltered, by user, by area.
    await queryRunner.query(
      `CREATE INDEX idx_area_entry_logs_time ON area_entry_logs (entry_time DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_area_entry_logs_user_time ON area_entry_logs (user_id, entry_time DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_area_entry_logs_area_time ON area_entry_logs (area_id, entry_time DESC, id DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE area_entry_logs`);
    await queryRunner.query(`DROP TABLE user_location_states`);
    await queryRunner.query(`DROP TABLE areas`);
    // The postgis extension is left in place: other schemas may depend on it.
  }
}
