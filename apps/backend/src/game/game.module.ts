import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GameEmitter } from './game.emitter';
import { GameTimers } from './game.timers';
import { DrawingRelay } from './drawing.relay';

/**
 * Wires the realtime game. RoomService, WordsService, UsersService, Prisma,
 * Redis and Auth all come from @Global() modules, so this module only declares
 * the game-specific providers.
 */
@Module({
  providers: [GameGateway, GameService, GameEmitter, GameTimers, DrawingRelay],
  exports: [GameService],
})
export class GameModule {}
