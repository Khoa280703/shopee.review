import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '@app/database';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Log full error server-side; never expose meta/stack to the client.
    this.logger.error(
      `Prisma error ${exception.code}: ${exception.message}`,
      exception.stack,
    );

    let statusCode: number;
    let message: string;

    switch (exception.code) {
      case 'P2002':
        statusCode = HttpStatus.CONFLICT;
        message = 'Dữ liệu đã tồn tại';
        break;
      case 'P2025':
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Không tìm thấy';
        break;
      default:
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Yêu cầu không hợp lệ';
        // Unexpected Prisma error codes are worth reporting (no-op without DSN).
        Sentry.captureException(exception);
    }

    response.status(statusCode).json({ statusCode, message });
  }
}
