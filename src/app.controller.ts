import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Genel')
@Controller()
export class AppController {
  // Landing response for anyone opening the base URL in a browser.
  @Get()
  @ApiOperation({
    summary: 'Servisin adını ve faydalı adresleri döndürür',
    description:
      'Uygulamanın ana adresi (/) açıldığında servisin çalıştığını gösterir ve ' +
      'API dokümantasyonunun (Swagger) ve sağlık kontrolünün adreslerini verir.',
  })
  @ApiOkResponse({
    description: 'Servis çalışıyor.',
    schema: {
      example: {
        name: 'marti-location-tracking-api',
        message: 'Marti Location Tracking API is running',
        docs: '/docs',
        health: '/health',
      },
    },
  })
  welcome() {
    return {
      name: 'marti-location-tracking-api',
      message: 'Marti Location Tracking API is running',
      docs: '/docs',
      health: '/health',
    };
  }
}
