import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../config/env.js';

const KEY_PREFIX = 'carenta:rl:';

/**
 * Fixed-window counters and cooldowns in Valkey, for abuse limits such as failed logins.
 *
 * Fails open: if Valkey is unreachable the limits are skipped (and logged) rather than
 * locking everyone out of signing in. Methods return the seconds to wait when blocked,
 * `null` when allowed.
 */
@Injectable()
export class RateLimitService implements OnApplicationShutdown {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly valkeyUrl: string;
  private client: Redis | undefined;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.valkeyUrl = config.get('VALKEY_URL', { infer: true });
  }

  /** Seconds until `key` drops below `limit`, or null if it is below already. Does not count. */
  async blockedFor(key: string, limit: number): Promise<number | null> {
    return this.safely(async (valkey) => {
      const [count, ttl] = await Promise.all([
        valkey.get(KEY_PREFIX + key),
        valkey.ttl(KEY_PREFIX + key),
      ]);
      return Number(count ?? 0) >= limit ? Math.max(ttl, 1) : null;
    });
  }

  /** Counts one event in a `windowSeconds` window that starts at the first event. */
  async hit(key: string, windowSeconds: number): Promise<void> {
    await this.safely(async (valkey) => {
      await valkey
        .multi()
        .incr(KEY_PREFIX + key)
        .expire(KEY_PREFIX + key, windowSeconds, 'NX')
        .exec();
      return null;
    });
  }

  /** Counts one event and returns the wait if that went over `limit`. */
  async consume(key: string, limit: number, windowSeconds: number): Promise<number | null> {
    return this.safely(async (valkey) => {
      const results = await valkey
        .multi()
        .incr(KEY_PREFIX + key)
        .expire(KEY_PREFIX + key, windowSeconds, 'NX')
        .ttl(KEY_PREFIX + key)
        .exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
      return count > limit ? Math.max(ttl, 1) : null;
    });
  }

  /** Starts a cooldown unless one is running; returns the remaining wait if it is. */
  async cooldown(key: string, seconds: number): Promise<number | null> {
    return this.safely(async (valkey) => {
      const set = await valkey.set(KEY_PREFIX + key, '1', 'EX', seconds, 'NX');
      if (set === 'OK') return null;
      return Math.max(await valkey.ttl(KEY_PREFIX + key), 1);
    });
  }

  async reset(...keys: string[]): Promise<void> {
    await this.safely(async (valkey) => {
      await valkey.del(...keys.map((key) => KEY_PREFIX + key));
      return null;
    });
  }

  async onApplicationShutdown() {
    await this.client?.quit().catch(() => this.client?.disconnect());
  }

  private async safely(run: (valkey: Redis) => Promise<number | null>): Promise<number | null> {
    try {
      return await run(this.valkey());
    } catch (error) {
      this.logger.error(
        `Rate limit skipped, Valkey unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private valkey(): Redis {
    if (!this.client) {
      this.client = new Redis(this.valkeyUrl, {
        lazyConnect: true,
        // A login must not hang on Valkey: fail the command fast and fail open.
        maxRetriesPerRequest: 1,
        commandTimeout: 1000,
        enableOfflineQueue: true,
      });
      this.client.on('error', (error: Error) =>
        this.logger.error(`Valkey (rate limit): ${error.message}`),
      );
    }
    return this.client;
  }
}
