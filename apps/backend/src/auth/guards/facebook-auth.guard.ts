import { type ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { mintOAuthState } from '../../common/oauth-state';

@Injectable()
export class FacebookAuthGuard extends AuthGuard('facebook') {
  getAuthenticateOptions(context: ExecutionContext): Record<string, unknown> {
    return mintOAuthState(context);
  }
}
