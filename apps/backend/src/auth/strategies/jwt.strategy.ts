import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import { AuthUser, JwtAccessPayload } from '../jwt.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<{ config: AppConfig }>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('config', { infer: true })!.jwt.accessSecret,
    });
  }

  /** Whatever this returns becomes `request.user`. */
  validate(payload: JwtAccessPayload): AuthUser {
    return { userId: payload.sub, username: payload.username, isGuest: payload.isGuest };
  }
}
