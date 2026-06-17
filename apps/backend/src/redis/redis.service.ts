import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';

/**
 * Thin wrapper exposing the raw ioredis client plus a couple of duplicated
 * connections the Socket.IO Redis adapter requires (a dedicated pub and sub
 * client — a subscriber connection can't issue normal commands).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly pub: Redis;
  readonly sub: Redis;

  constructor(config: ConfigService<{ config: AppConfig }>) {
    const url = config.get('config', { infer: true })!.redisUrl;
    const opts = { maxRetriesPerRequest: null, lazyConnect: false } as const;
    this.client = new Redis(url, opts);
    this.pub = new Redis(url, opts);
    this.sub = new Redis(url, opts);
  }

  onModuleInit() {
    for (const [name, c] of [
      ['client', this.client],
      ['pub', this.pub],
      ['sub', this.sub],
    ] as const) {
      c.on('error', (e) => this.logger.error(`Redis ${name} error: ${e.message}`));
    }
    this.logger.log('Redis clients initialized');
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.pub.quit(), this.sub.quit()]);
  }

  /**
   * Sliding-window-ish token bucket via INCR+EXPIRE. Returns true if the action
   * is allowed. Used for chat/guess anti-spam and socket-event flood control.
   */
  async rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, windowSec);
    return count <= limit;
  }
}
