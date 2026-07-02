import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@app/database';

// Client-facing shape: strips secrets and internal session/verification state.
// `isAdmin` is intentionally retained (client gates the /admin UI on it).
export type AuthUser = Omit<
  User,
  | 'passwordHash'
  | 'verifyToken'
  | 'verifyTokenExp'
  | 'resetToken'
  | 'resetTokenExp'
  | 'tokenVersion'
>;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
