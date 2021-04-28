import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { AuthService } from './auth.service'
import { AppConfig } from '..//config/app.config'
import { Session } from '../session/session.entity'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    protected configService: ConfigService,
    protected authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: configService.get<AppConfig>('app').jwt_secret,
    })
  }

  async validate(payload: unknown): Promise<Session> {
    return this.authService.recoverSession(payload)
  }
}