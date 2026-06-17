import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

/** Liveness/readiness probe for Docker/K8s and the Nginx upstream check. */
@Controller()
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get('health')
  health() {
    return { status: 'ok', uptime: process.uptime(), ts: Date.now() };
  }
}
