import { Controller, Get, Param, Query } from '@nestjs/common';
import type { UserProfile } from '@skribble/shared';
import { UsersService } from './users.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get('leaderboard')
  leaderboard(@Query('limit') limit?: string) {
    return this.users.topPlayers(limit ? Math.min(parseInt(limit, 10) || 50, 100) : 50);
  }

  @Public()
  @Get(':id')
  profile(@Param('id') id: string): Promise<UserProfile> {
    return this.users.getProfile(id);
  }
}
