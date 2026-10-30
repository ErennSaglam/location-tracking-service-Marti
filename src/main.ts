import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  // Phones send a location every 5 s, right at Node's default 5 s idle timeout.
  // A longer timeout keeps their connections open between requests instead of
  // reconnecting each time. headersTimeout must exceed keepAliveTimeout.
  const server = app.getHttpServer();
  server.keepAliveTimeout = Number(
    process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS ?? 65_000,
  );
  server.headersTimeout = server.keepAliveTimeout + 1_000;

  const openApi = new DocumentBuilder()
    .setTitle('Marti Location Tracking API')
    .setDescription(
      'Kullanıcıların konumlarını takip eden ve kullanıcı tanımlı bir alana (polygon) girdiğinde ' +
        'giriş kaydı oluşturan servis.\n\n' +
        '**Deneme sırası:** 1) `POST /areas` ile bir alan oluşturun, 2) `POST /locations` ile bu alanın ' +
        'içinde bir konum gönderin, 3) `GET /logs` ile oluşan giriş kaydını görün.\n\n' +
        'Koordinatlar: enlem (latitude) -90..90, boylam (longitude) -180..180. Alan şekillerinde (GeoJSON) ' +
        'sıra **[boylam, enlem]**.',
    )
    .setVersion('1.0')
    .addTag('Genel', 'Servisin ana adresi')
    .addTag(
      'Alanlar',
      'Haritada takip edilecek bölgeleri (polygon) tanımlama ve listeleme',
    )
    .addTag(
      'Konumlar',
      'Kullanıcı konumlarını gönderme; alana giriş burada tespit edilir',
    )
    .addTag(
      'Giriş kayıtları',
      'Kullanıcıların alanlara giriş kayıtlarını filtreleyip sayfa sayfa listeleme',
    )
    .addTag(
      'Sağlık',
      'Servisin ve veritabanının çalışıp çalışmadığını kontrol etme',
    )
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, openApi),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
