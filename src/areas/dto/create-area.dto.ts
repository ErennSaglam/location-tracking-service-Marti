import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsDefined,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NoNullCharacters } from '../../common/validators/no-null-characters.validator.js';
import { IsPolygonCoordinates } from './is-polygon-coordinates.validator.js';

const KADIKOY_COORDINATES = [
  [
    [29.0, 41.0],
    [29.1, 41.0],
    [29.1, 41.1],
    [29.0, 41.1],
    [29.0, 41.0],
  ],
];

export class PolygonGeometryDto {
  @ApiProperty({
    description: 'Şeklin tipi. Her zaman "Polygon".',
    enum: ['Polygon'],
    example: 'Polygon',
  })
  @Equals('Polygon')
  type: 'Polygon';

  /** GeoJSON order: [longitude, latitude]. First ring is the outer boundary, the rest are holes. */
  @ApiProperty({
    description:
      'Köşe noktaları. Her nokta [boylam, enlem]. İlk liste alanın dış sınırıdır; ' +
      'varsa sonraki listeler alanın içindeki deliklerdir (alana dahil olmayan boşluklar). ' +
      'Her liste en az 4 nokta içermeli, ilk ve son nokta aynı olmalı (şekil kapanmalı) ' +
      've kenarlar birbirini kesmemelidir.',
    type: 'array',
    items: {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
    },
    example: KADIKOY_COORDINATES,
  })
  @IsPolygonCoordinates()
  coordinates: number[][][];
}

export class CreateAreaDto {
  @ApiProperty({
    description: 'Alanın adı. Benzersiz olmalı.',
    maxLength: 100,
    example: 'Kadikoy',
  })
  // Trimmed so "  Kadikoy " and "Kadikoy" are the same name and "   " is empty.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @NoNullCharacters()
  name: string;

  @ApiProperty({
    description: 'Alanın şekli (GeoJSON Polygon).',
    type: () => PolygonGeometryDto,
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => PolygonGeometryDto)
  polygon: PolygonGeometryDto;
}
