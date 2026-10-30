import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AreaEntryLog } from '../entities/area-entry-log.entity.js';
import { LogsController } from './logs.controller.js';
import { LogsService } from './logs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AreaEntryLog])],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
