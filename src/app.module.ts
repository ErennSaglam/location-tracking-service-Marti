import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AreasModule } from './areas/areas.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { LogsModule } from './logs/logs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AreasModule,
    LocationsModule,
    LogsModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
