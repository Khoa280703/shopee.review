import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/current-user.decorator';

/**
 * Runs AFTER JwtAuthGuard. Requires the authenticated user to be an admin.
 * `isAdmin` is populated by JwtStrategy from the DB, so it can't be forged.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user?.isAdmin) {
      throw new ForbiddenException('Yêu cầu quyền quản trị');
    }
    return true;
  }
}
