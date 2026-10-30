import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AreaEntryLog } from '../entities/area-entry-log.entity.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { UserLocationState } from '../entities/user-location-state.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserLocationState, AreaEntryLog])],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
