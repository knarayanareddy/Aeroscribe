import type { Logger } from '../lib/logger';
import type { CoordinationBackend, Coordinator } from './ports';
import { createProcessCoordinator } from './process';
import { createRedisCoordinator, redactRedisUrl } from './redis';

export * from './ports';
export * from './window';
export * from './process';
export * from './redis';

export interface CoordinationSettings {
  /** `AEROSCRIBE_COORDINATION`, validated by `loadConfig`. */
  backend: CoordinationBackend;
  /** `AEROSCRIBE_REDIS_URL`; required by `redis` and rejected by `process`. */
  redisUrl?: string | null;
  /** Requests per window, so a test can use three instead of sixty. */
  limit?: number;
  windowMs?: number;
  lockTtlMs?: number;
  logger?: Logger;
}

/**
 * The coordinator factory: one place decides where shared state lives.
 *
 * The default is `process`, which is the truth for a single instance and is
 * reported as such by `/health`. `redis` is only chosen when the operator asks
 * for it *and* supplies a URL — `loadConfig` refuses either half on its own,
 * because a process told to share state that quietly counts locally is the
 * failure mode this section exists to prevent.
 */
export function createCoordinator(settings: CoordinationSettings): Coordinator {
  switch (settings.backend) {
    case 'process':
      return createProcessCoordinator({
        ...(settings.limit === undefined ? {} : { limit: settings.limit }),
        ...(settings.windowMs === undefined ? {} : { windowMs: settings.windowMs }),
      });
    case 'redis': {
      if (!settings.redisUrl) {
        throw new Error('AEROSCRIBE_COORDINATION=redis needs AEROSCRIBE_REDIS_URL.');
      }
      return createRedisCoordinator({
        url: settings.redisUrl,
        ...(settings.limit === undefined ? {} : { limit: settings.limit }),
        ...(settings.windowMs === undefined ? {} : { windowMs: settings.windowMs }),
        ...(settings.lockTtlMs === undefined ? {} : { lockTtlMs: settings.lockTtlMs }),
        ...(settings.logger
          ? {
              log: (event: string, fields: Record<string, unknown>) =>
                settings.logger?.warn(event, fields),
            }
          : {}),
      });
    }
    default: {
      const unreachable: never = settings.backend;
      throw new Error(`No coordinator for AEROSCRIBE_COORDINATION=${String(unreachable)}`);
    }
  }
}

export { redactRedisUrl };
