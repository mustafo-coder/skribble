import { Controller, Get } from '@nestjs/common';
import type { RoomSummary } from '@skribble/shared';
import { RoomService } from './room.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomService) {}

  /** Lobby browser: list joinable public rooms. Room create/join is over WS. */
  @Public()
  @Get()
  list(): Promise<RoomSummary[]> {
    return this.rooms.listPublic();
  }
}
