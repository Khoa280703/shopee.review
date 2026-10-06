import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  /** Google's own attestation that `email` belongs to this account. */
  emailVerified: boolean;
}

/** Shape of the raw userinfo payload Passport stores on `profile._json`. */
interface GoogleRawProfile {
  email_verified?: boolean | string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'missing-google-client-id',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'missing-google-secret',
      callbackURL:
        configService.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3066/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const rawEmailVerified = (profile as unknown as { _json?: GoogleRawProfile })._json
      ?.email_verified;
    const user: GoogleProfile = {
      googleId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      displayName: profile.displayName || profile.username || 'Người dùng',
      avatarUrl: profile.photos?.[0]?.value,
      // Only an explicit false/"false" counts as unverified; Google always
      // includes this field as a real boolean, but default to trusted so a
      // missing field never breaks login.
      emailVerified: !(rawEmailVerified === false || rawEmailVerified === 'false'),
    };
    done(null, user);
  }
}
