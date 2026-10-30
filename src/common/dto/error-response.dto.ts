import { ApiProperty, ApiServiceUnavailableResponse } from '@nestjs/swagger';

// Shape of every error response (Nest's default exception body); used only
// to document 4xx responses in Swagger.
export class ErrorResponseDto {
  @ApiProperty({ description: 'HTTP durum kodu', example: 400 })
  statusCode: number;

  @ApiProperty({
    description:
      'Hatanın açıklaması. Doğrulama hatalarında her kural için bir mesaj içeren liste olur.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['latitude must not be greater than 90'],
  })
  message: string | string[];

  @ApiProperty({ description: 'HTTP durumunun adı', example: 'Bad Request' })
  error: string;
}

// Every database-backed endpoint answers 503 when PostgreSQL is unreachable.
export const ApiDatabaseUnavailableResponse = () =>
  ApiServiceUnavailableResponse({
    description:
      'Veritabanına geçici olarak ulaşılamıyor. İstek değiştirilmeden daha sonra tekrar denenebilir. ' +
      'Mesaj: "Service temporarily unavailable, please retry".',
    type: ErrorResponseDto,
    example: {
      message: 'Service temporarily unavailable, please retry',
      error: 'Service Unavailable',
      statusCode: 503,
    },
  });
