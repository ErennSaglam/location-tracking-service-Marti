import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NoNullCharacters } from '../../common/validators/no-null-characters.validator.js';

// areas.id is a PostgreSQL integer column.
const MAX_AREA_ID = 2_147_483_647;

export class ListLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Sadece bu kullanıcının giriş kayıtları.',
    example: 'ali',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @NoNullCharacters()
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Sadece bu alanın giriş kayıtları (GET /areas yanıtındaki id).',
    example: 1,
    minimum: 1,
    maximum: MAX_AREA_ID,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AREA_ID)
  areaId?: number;

  @ApiPropertyOptional({
    description: 'Bir sayfada kaç kayıt döneceği.',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  /** `nextCursor` from the previous page. */
  @ApiPropertyOptional({
    description:
      'Sonraki sayfayı almak için bir önceki yanıttaki nextCursor değeri. İlk sayfada gönderilmez.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
