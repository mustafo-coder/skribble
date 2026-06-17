import { Global, Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomService } from './room.service';

@Global()
@Module({
  controllers: [RoomsController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomsModule {}
