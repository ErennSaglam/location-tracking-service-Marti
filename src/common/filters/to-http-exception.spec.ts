import { BadRequestException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { toHttpException } from './to-http-exception.js';

const pgError = (code: string) =>
  new QueryFailedError(
    'SELECT 1',
    [],
    Object.assign(new Error('pg'), { code }),
  );

describe('toHttpException', () => {
  it('keeps existing HTTP errors', () => {
    const error = new BadRequestException('bad');
    expect(toHttpException(error)).toBe(error);
  });

  it.each([
    ['22003 numeric value out of range', '22003', HttpStatus.BAD_REQUEST],
    ['22021 invalid byte sequence (NUL)', '22021', HttpStatus.BAD_REQUEST],
    ['22008 timestamp out of range', '22008', HttpStatus.BAD_REQUEST],
    ['23505 unique violation', '23505', HttpStatus.CONFLICT],
    ['23503 foreign key violation', '23503', HttpStatus.CONFLICT],
    ['40P01 deadlock', '40P01', HttpStatus.SERVICE_UNAVAILABLE],
    ['57P01 server shutting down', '57P01', HttpStatus.SERVICE_UNAVAILABLE],
    ['08006 connection failure', '08006', HttpStatus.SERVICE_UNAVAILABLE],
    ['53300 too many connections', '53300', HttpStatus.SERVICE_UNAVAILABLE],
  ])('maps PostgreSQL %s', (_label, code, status) => {
    expect(toHttpException(pgError(code))?.getStatus()).toBe(status);
  });

  it.each([
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5440'), {
      code: 'ECONNREFUSED',
    }),
    new Error('Connection terminated unexpectedly'),
    new Error('timeout exceeded when trying to connect'),
  ])('maps database connection errors to 503: %s', (error) => {
    expect(toHttpException(error)?.getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it('keeps 4xx errors raised by request body parsing', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
    });
    expect(toHttpException(tooLarge)?.getStatus()).toBe(
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  });

  it('returns undefined for unknown errors', () => {
    expect(toHttpException(new Error('bug'))).toBeUndefined();
    expect(toHttpException(pgError('XX000'))).toBeUndefined();
  });
});
