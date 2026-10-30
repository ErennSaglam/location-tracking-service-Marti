import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('Sağlık')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  // Health check: 200 when the database answers, 503 otherwise.
  @Get()
  // Terminus' own Swagger docs append English descriptions; ours are below.
  // Passing options replaces the defaults, so noCache must be set explicitly.
  @HealthCheck({ noCache: true, swaggerDocumentation: false })
  @ApiOperation({
    summary: 'Servisin ve veritabanının çalıştığını kontrol eder',
    description:
      'Uygulamanın ve veritabanının çalışıp çalışmadığını gösterir. Uygulama veritabanına ' +
      'en basit sorguyu (`SELECT 1`) gönderir. Veritabanı 1 saniye içinde cevap verirse 200, ' +
      'vermezse 503 döner.',
  })
  @ApiOkResponse({
    description: 'Servis çalışıyor ve veritabanına bağlanabiliyor.',
    schema: {
      example: {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Veritabanına ulaşılamıyor.',
    schema: {
      example: {
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      },
    },
  })
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
