import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

// Network-level failures while talking to PostgreSQL (pg / Node errors).
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
]);
const CONNECTION_ERROR_MESSAGE =
  /Connection terminated|timeout exceeded when trying to connect|Connection ended|connect ECONNREFUSED/i;

const RETRY_LATER = 'Service temporarily unavailable, please retry';

// Translates errors that are not HttpExceptions into the matching HTTP error,
// or returns undefined when the error is not a known kind.
export function toHttpException(error: unknown): HttpException | undefined {
  if (error instanceof HttpException) return error;

  if (error instanceof QueryFailedError) {
    return fromPostgresCode(
      (error.driverError as { code?: string }).code ?? '',
    );
  }

  if (isConnectionError(error)) {
    return new ServiceUnavailableException(RETRY_LATER);
  }

  // Errors raised by Express body parsing (e.g. payload too large) carry a 4xx status.
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new HttpException(
      { statusCode: status, message: (error as Error).message },
      status,
    );
  }

  return undefined;
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
function fromPostgresCode(code: string): HttpException | undefined {
  if (code === '23505') {
    return new ConflictException('Resource already exists');
  }
  if (code === '23503') {
    return new ConflictException('Referenced resource does not exist');
  }
  // Class 22 "data exception": a value the database cannot store or compare
  // (out of range number or date, invalid characters, malformed geometry).
  if (code.startsWith('22')) {
    return new BadRequestException(
      'Request contains a value the database cannot process',
    );
  }
  // Serialization failure, deadlock, cancelled statement, connection problems,
  // insufficient resources, server shutting down: all transient.
  if (
    code === '40001' ||
    code === '40P01' ||
    code === '57014' ||
    code.startsWith('08') ||
    code.startsWith('53') ||
    code.startsWith('57P')
  ) {
    return new ServiceUnavailableException(RETRY_LATER);
  }
  return undefined;
}

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) ||
    CONNECTION_ERROR_MESSAGE.test(error.message)
  );
}
