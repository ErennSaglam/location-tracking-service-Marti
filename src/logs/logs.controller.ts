import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiDatabaseUnavailableResponse,
  ErrorResponseDto,
} from '../common/dto/error-response.dto.js';
import { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import { LogsPageDto } from './dto/logs-page.dto.js';
import { type LogsPage, LogsService } from './logs.service.js';

@ApiTags('Giriş kayıtları')
@ApiDatabaseUnavailableResponse()
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Alan giriş kayıtlarını listeler',
    description:
      'Kullanıcıların alanlara giriş kayıtlarını en yeniden eskiye döndürür. Kullanıcıya ve/veya ' +
      'alana göre filtrelenebilir. Sonuçlar sayfalıdır: yanıttaki nextCursor değeri bir sonraki ' +
      'istekte cursor parametresine verilerek sonraki sayfa alınır.',
  })
  @ApiOkResponse({ description: 'Bir sayfa giriş kaydı.', type: LogsPageDto })
  @ApiBadRequestResponse({
    description:
      'Geçersiz parametre: limit 1–100 dışında, areaId sayı değil veya cursor bozuk ("Invalid cursor").',
    type: ErrorResponseDto,
    example: {
      message: 'Invalid cursor',
      error: 'Bad Request',
      statusCode: 400,
    },
  })
  list(@Query() listLogsQueryDto: ListLogsQueryDto): Promise<LogsPage> {
    return this.logsService.list(listLogsQueryDto);
  }
}
