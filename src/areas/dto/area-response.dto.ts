import { ApiProperty } from '@nestjs/swagger';

// Response shapes are documented here; the controller returns the Area entity,
// which has exactly these fields.
export class PolygonResponseDto {
  @ApiProperty({ enum: ['Polygon'], example: 'Polygon' })
  type: 'Polygon';

  @ApiProperty({
    description: 'Köşe noktaları, [boylam, enlem] sırasıyla.',
    type: 'array',
    items: {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
    },
    example: [
      [
        [29, 41],
        [29.1, 41],
        [29.1, 41.1],
        [29, 41.1],
        [29, 41],
      ],
    ],
  })
  coordinates: number[][][];
}

export class AreaResponseDto {
  @ApiProperty({ description: 'Alanın numarası', example: 1 })
  id: number;

  @ApiProperty({ description: 'Alanın adı', example: 'Kadikoy' })
  name: string;

  @ApiProperty({ description: 'Alanın şekli', type: () => PolygonResponseDto })
  polygon: PolygonResponseDto;

  @ApiProperty({
    description: 'Oluşturulma anı',
    format: 'date-time',
    example: '2026-10-27T10:23:25.844Z',
  })
  createdAt: Date;
}
