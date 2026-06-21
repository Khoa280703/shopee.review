import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@app/database';

export type AuthUser = Omit<User, 'passwordHash' | 'verifyToken'>;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
