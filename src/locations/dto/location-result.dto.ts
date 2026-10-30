import { ApiProperty } from '@nestjs/swagger';

// Documents LocationProcessingResult for Swagger.
export class LocationResultDto {
  @ApiProperty({
    description:
      'processed: konum işlendi. ' +
      'stale_ignored: bu konum daha önce işlenmiş bir konumdan eski; yok sayıldı (geç gelen istek). ' +
      'duplicate_ignored: aynı konum aynı zamanla tekrar gönderildi; yok sayıldı.',
    enum: ['processed', 'stale_ignored', 'duplicate_ignored'],
    example: 'processed',
  })
  status: 'processed' | 'stale_ignored' | 'duplicate_ignored';

  @ApiProperty({
    description:
      'Bu konumla kullanıcının yeni girdiği alanların id listesi. Her biri için giriş kaydı oluşturuldu. Boşsa yeni giriş yok.',
    type: [Number],
    example: [1],
  })
  enteredAreaIds: number[];

  @ApiProperty({
    description:
      'Kullanıcının şu an içinde bulunduğu tüm alanların id listesi.',
    type: [Number],
    example: [1],
  })
  currentAreaIds: number[];
}
