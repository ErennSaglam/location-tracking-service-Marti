import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AreaEntryLog } from '../entities/area-entry-log.entity.js';
import type { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import { decodeCursor, encodeCursor } from './logs-cursor.js';

export interface LogsPage {
  data: AreaEntryLog[];
  nextCursor: string | null;
}

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(AreaEntryLog)
    private readonly logs: Repository<AreaEntryLog>,
  ) {}

  // Newest first. Keyset pagination keeps every page an index range scan,
  // unlike OFFSET, which gets slower the deeper the page.
  async list(listLogsQueryDto: ListLogsQueryDto): Promise<LogsPage> {
    const qb = this.logs
      .createQueryBuilder('log')
      .select(['log.id', 'log.userId', 'log.areaId', 'log.entryTime'])
      .orderBy('log.entryTime', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .limit(listLogsQueryDto.limit + 1);

    if (listLogsQueryDto.userId !== undefined) {
      qb.andWhere('log.userId = :userId', { userId: listLogsQueryDto.userId });
    }
    if (listLogsQueryDto.areaId !== undefined) {
      qb.andWhere('log.areaId = :areaId', { areaId: listLogsQueryDto.areaId });
    }
    if (listLogsQueryDto.cursor !== undefined) {
      const cursor = decodeCursor(listLogsQueryDto.cursor);
      qb.andWhere('(log.entryTime, log.id) < (:cursorTime, :cursorId)', {
        cursorTime: cursor.entryTime,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > listLogsQueryDto.limit;
    const data = hasMore ? rows.slice(0, listLogsQueryDto.limit) : rows;
    const last = data.at(-1);

    return {
      data,
      nextCursor:
        hasMore && last
          ? encodeCursor({ entryTime: last.entryTime, id: last.id })
          : null,
    };
  }
}
