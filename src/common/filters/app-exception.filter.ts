import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { toHttpException } from './to-http-exception.js';

// Global counterpart of Spring's @ControllerAdvice: every error leaving a
// controller is answered here. Known failures (bad input reaching the
// database, database unavailable) get their proper 4xx/503 code; only a
// genuinely unexpected error is a 500, and it is logged with its stack.
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = toHttpException(exception);

    if (!httpException) {
      this.logger.error(
        'Unhandled error',
        exception instanceof Error ? exception.stack : String(exception),
      );
      const fallback = new InternalServerErrorException();
      response.status(fallback.getStatus()).json(fallback.getResponse());
      return;
    }

    if (httpException.getStatus() >= 500) {
      this.logger.warn(
        `${httpException.getStatus()}: ${exception instanceof Error ? exception.message : String(exception)}`,
      );
    }
    response
      .status(httpException.getStatus())
      .json(httpException.getResponse());
  }
}
