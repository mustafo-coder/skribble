import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RoomStore } from './room.store';

@Global()
@Module({
  providers: [RedisService, RoomStore],
  exports: [RedisService, RoomStore],
})
export class RedisModule {}
