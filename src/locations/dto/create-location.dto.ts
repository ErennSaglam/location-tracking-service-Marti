import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NoNullCharacters } from '../../common/validators/no-null-characters.validator.js';

export class CreateLocationDto {
  @ApiProperty({
    description: 'Kullanıcının kimliği.',
    maxLength: 128,
    example: 'ali',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @NoNullCharacters()
  userId: string;

  @ApiProperty({
    description: 'Enlem (kuzey-güney), -90 ile 90 arası.',
    minimum: -90,
    maximum: 90,
    example: 41.05,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Boylam (doğu-batı), -180 ile 180 arası.',
    minimum: -180,
    maximum: 180,
    example: 29.05,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  /** Device time of the reading, ISO 8601 with an explicit offset, e.g. 2026-10-25T09:00:00.000Z. */
  @ApiProperty({
    description:
      'Konumun telefonda alındığı an. ISO 8601 formatında ve saat dilimiyle ' +
      '("Z" = UTC veya "+03:00" gibi). En fazla 60 saniye ileride olabilir.',
    format: 'date-time',
    example: '2026-10-27T09:00:05.000Z',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'timestamp must include a timezone offset (Z or ±hh:mm)',
  })
  // Listed last so its message comes first when the field is missing.
  @IsNotEmpty()
  timestamp: string;
}
