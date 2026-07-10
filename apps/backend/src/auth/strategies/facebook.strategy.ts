import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-facebook';

export interface FacebookProfile {
  facebookId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

type FacebookVerified = (err: unknown, user?: FacebookProfile) => void;

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('FACEBOOK_CLIENT_ID') || 'missing-facebook-client-id',
      clientSecret: configService.get<string>('FACEBOOK_CLIENT_SECRET') || 'missing-facebook-secret',
      callbackURL:
        configService.get<string>('FACEBOOK_CALLBACK_URL') ||
        'http://localhost:3066/api/auth/facebook/callback',
      // email is not guaranteed — the app must request it and the user must grant.
      scope: ['email'],
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: FacebookVerified,
  ): void {
    const user: FacebookProfile = {
      facebookId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      displayName: profile.displayName || 'Người dùng',
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, user);
  }
}
