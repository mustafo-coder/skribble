import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthResponse, AuthTokens, UserProfile } from '@skribble/shared';
import { AuthService } from './auth.service';
import { GuestDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './jwt.types';

function reqMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 attempts/min/IP
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.register(dto, reqMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.login(dto, reqMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('guest')
  guest(@Body() dto: GuestDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.guest(dto, reqMeta(req));
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken, reqMeta(req));
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.auth.me(user.userId);
  }
}
