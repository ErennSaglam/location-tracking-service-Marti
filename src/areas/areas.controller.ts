import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiDatabaseUnavailableResponse,
  ErrorResponseDto,
} from '../common/dto/error-response.dto.js';
import type { Area } from '../entities/area.entity.js';
import { AreasService } from './areas.service.js';
import { AreaResponseDto } from './dto/area-response.dto.js';
import { CreateAreaDto } from './dto/create-area.dto.js';

@ApiTags('Alanlar')
@ApiDatabaseUnavailableResponse()
@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Post()
  @ApiOperation({
    summary: 'Yeni bir alan (polygon) tanımlar',
    description:
      'Haritaya köşe noktalarıyla tanımlanan yeni bir bölge ekler. Kullanıcılar bu bölgeye ' +
      'girdiğinde giriş kaydı oluşturulur. Alanlar iç içe veya örtüşük olabilir. ' +
      'Koordinatlar [boylam, enlem] sırasıyla verilir.',
  })
  @ApiCreatedResponse({
    description: 'Alan oluşturuldu.',
    type: AreaResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Geçersiz alan: şekil kapanmamış, 4\'ten az nokta, koordinat aralık dışında, tip "Polygon" değil ' +
      'veya kenarlar birbirini kesiyor. Örnek mesajlar: ' +
      '"polygon.coordinates: ring 0 must be closed (first and last positions equal)", ' +
      '"Invalid polygon: Self-intersection[29.05 41.05]".',
    type: ErrorResponseDto,
    examples: {
      invalidShape: {
        summary:
          'Şekil kapanmamış, 4\'ten az nokta, geçersiz koordinat, "Polygon" dışında tip',
        value: {
          message: [
            'polygon.coordinates: ring 0 must be closed (first and last positions equal)',
          ],
          error: 'Bad Request',
          statusCode: 400,
        },
      },
      selfIntersection: {
        summary: 'Kenarlar birbirini kesiyor (örn. "papyon" şekli)',
        value: {
          message: 'Invalid polygon: Self-intersection[29.05 41.05]',
          error: 'Bad Request',
          statusCode: 400,
        },
      },
    },
  })
  @ApiConflictResponse({
    description:
      'Aynı isimde bir alan zaten var. Örnek mesaj: "Area name \\"Kadikoy\\" already exists".',
    type: ErrorResponseDto,
    example: {
      message: 'Area name "Kadikoy" already exists',
      error: 'Conflict',
      statusCode: 409,
    },
  })
  create(@Body() createAreaDto: CreateAreaDto): Promise<Area> {
    return this.areasService.create(createAreaDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Tanımlı tüm alanları listeler',
    description:
      'Alanları oluşturulma sırasıyla (id) ve şekilleriyle birlikte döndürür.',
  })
  @ApiOkResponse({ description: 'Alan listesi.', type: [AreaResponseDto] })
  findAll(): Promise<Area[]> {
    return this.areasService.findAll();
  }
}
