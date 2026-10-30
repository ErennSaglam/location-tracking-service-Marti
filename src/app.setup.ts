import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { AppExceptionFilter } from './common/filters/app-exception.filter.js';

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new AppExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
