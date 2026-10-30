import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiDatabaseUnavailableResponse,
  ErrorResponseDto,
} from '../common/dto/error-response.dto.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LocationResultDto } from './dto/location-result.dto.js';
import {
  type LocationProcessingResult,
  LocationsService,
} from './locations.service.js';

@ApiTags('Konumlar')
@ApiDatabaseUnavailableResponse()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // 200 rather than 201: stale and duplicate updates create nothing.
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kullanıcının güncel konumunu gönderir',
    description:
      "Mobil uygulama bu endpoint'i yaklaşık 5 saniyede bir çağırır. Servis konumun hangi alanların " +
      'içinde olduğuna bakar; kullanıcı önceki konumunda dışında olduğu bir alana girdiyse o alan için ' +
      'giriş kaydı oluşturur. Kullanıcı alanın içinde kalmaya devam ederse yeni kayıt oluşmaz; çıkıp ' +
      'tekrar girerse yeni kayıt oluşur. Geç gelen eski konumlar ve tekrar gönderimler yok sayılır.',
  })
  @ApiOkResponse({
    description:
      'Konum alındı. status alanı konumun işlendiğini veya neden yok sayıldığını belirtir.',
    type: LocationResultDto,
  })
  @ApiBadRequestResponse({
    description:
      'Geçersiz istek: eksik alan, aralık dışı koordinat, saat dilimi olmayan zaman ' +
      '("timestamp must include a timezone offset (Z or ±hh:mm)") veya 60 saniyeden fazla ileri ' +
      'tarihli zaman ("timestamp is in the future").',
    type: ErrorResponseDto,
    examples: {
      invalidPayload: {
        summary:
          'Eksik/hatalı alan, aralık dışı koordinat, saat dilimi olmayan zaman',
        value: {
          message: [
            'latitude must not be greater than 90',
            'timestamp must include a timezone offset (Z or ±hh:mm)',
          ],
          error: 'Bad Request',
          statusCode: 400,
        },
      },
      futureTimestamp: {
        summary: 'Zaman 60 saniyeden daha fazla ileride (gelecekte)',
        value: {
          message: 'timestamp is in the future',
          error: 'Bad Request',
          statusCode: 400,
        },
      },
    },
  })
  @ApiConflictResponse({
    description:
      'Bu kullanıcı için aynı zamanda farklı bir konum daha önce kaydedilmiş. Mesaj: ' +
      '"A different location was already recorded for this user at this timestamp".',
    type: ErrorResponseDto,
    example: {
      message:
        'A different location was already recorded for this user at this timestamp',
      error: 'Conflict',
      statusCode: 409,
    },
  })
  create(
    @Body() createLocationDto: CreateLocationDto,
  ): Promise<LocationProcessingResult> {
    return this.locationsService.process(createLocationDto);
  }
}
