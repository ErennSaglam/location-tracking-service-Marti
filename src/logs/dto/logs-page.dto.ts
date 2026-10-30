import { ApiProperty } from '@nestjs/swagger';

// Documents LogsPage for Swagger.
export class AreaEntryLogDto {
  @ApiProperty({
    description:
      'Kaydın numarası. Çok büyük sayılara ulaşabileceği için metin olarak döner.',
    example: '17',
  })
  id: string;

  @ApiProperty({ description: 'Alana giren kullanıcı', example: 'ali' })
  userId: string;

  @ApiProperty({
    description: 'Girilen alanın id değeri (GET /areas)',
    example: 1,
  })
  areaId: number;

  @ApiProperty({
    description: 'Giriş anı: alana girilen konumun timestamp değeri',
    format: 'date-time',
    example: '2026-10-27T09:00:05.000Z',
  })
  entryTime: Date;
}

export class LogsPageDto {
  @ApiProperty({
    description: 'Giriş kayıtları, en yeniden eskiye.',
    type: () => [AreaEntryLogDto],
  })
  data: AreaEntryLogDto[];

  @ApiProperty({
    description:
      'Sonraki sayfa için cursor parametresine verilecek değer. null ise başka kayıt yok.',
    type: String,
    nullable: true,
    example: 'MjAyNi0xMC0yN1QwOTowMDowNS4wMDBafDE3',
  })
  nextCursor: string | null;
}
