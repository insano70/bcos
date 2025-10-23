/**
 * Redis Client Singleton
 *
 * Centralized Redis/Valkey connection manager for the entire application.
 * Provides a single Redis client instance with automatic connection management.
 *
 * INFRASTRUCTURE:
 * - Development: AWS Valkey Serverless (VPC)
 * - Staging: AWS Valkey Serverless (VPC)
 * - Production: AWS Valkey Serverless (VPC)
 *
 * FEATURES:
 * - Singleton pattern - one client instance
 * - Automatic reconnection with exponential backoff
 * - Command queuing during reconnection (enableOfflineQueue: true)
 * - Environment-based key prefixing (bcos:dev:, bcos:staging:, bcos:prod:)
 * - Graceful degradation on connection failure
 *
 * USAGE:
 * ```typescript
 * import { getRedisClient, isRedisAvailable } from '@/lib/redis';
 *
 * const client = getRedisClient();
 * if (client) {
 *   await client.set('key', 'value', 'EX', 60);
 * }
 * ```
 */

import Redis from 'ioredis';
import { log } from '@/lib/logger';

interface RedisConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: boolean;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  enableOfflineQueue: boolean;
  retryStrategy: (times: number) => number | null;
}

class RedisClientManager {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;

  /**
   * Get or create Redis client
   *
   * Returns client even if connecting. Commands will be queued and executed
   * once connection is ready (enableOfflineQueue: true).
   *
   * Returns null only if Redis is not configured.
   */
  public getClient(): Redis | null {
    // If we have a client (connected or connecting), return it
    if (this.client) {
      return this.client;
    }

    // If we're not yet connecting and no client exists, start connection
    if (!this.isConnecting) {
      this.connect();
    }

    // Return the client (may be connecting, but that's OK with enableOfflineQueue: true)
    return this.client;
  }

  /**
   * Check if Redis is available and connected
   */
  public isAvailable(): boolean {
    return this.client !== null && this.isConnected;
  }

  /**
   * Connect to Redis/Valkey
   */
  private connect(): void {
    try {
      this.isConnecting = true;

      const config = this.buildConfig();

      if (!config.host) {
        log.warn('Redis not configured - caching disabled', {
          component: 'redis',
          reason: 'REDIS_HOST not set',
        });
        this.isConnecting = false;
        return;
      }

      log.debug('Connecting to Redis', {
        component: 'redis',
        host: config.host,
        port: config.port,
        username: config.username ? '[REDACTED]' : '(none)',
        keyPrefix: config.keyPrefix,
        tls: config.tls,
      });

      // Build Redis options
      const redisOptions: {
        host: string;
        port: number;
        username?: string;
        password?: string;
        tls?: Record<string, unknown>;
        keyPrefix: string;
        maxRetriesPerRequest: number;
        enableOfflineQueue: boolean;
        retryStrategy: (times: number) => number | null;
        lazyConnect: boolean;
      } = {
        host: config.host,
        port: config.port,
        keyPrefix: config.keyPrefix,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        enableOfflineQueue: config.enableOfflineQueue,
        retryStrategy: config.retryStrategy,
        lazyConnect: false,
      };

      // Add optional properties only if defined
      if (config.username !== undefined) {
        redisOptions.username = config.username;
      }
      if (config.password !== undefined) {
        redisOptions.password = config.password;
      }
      if (config.tls) {
        redisOptions.tls = {};
      }

      this.client = new Redis(redisOptions);

      // Event: Connected
      this.client.on('connect', () => {
        log.debug('Redis connected successfully', {
          component: 'redis',
          host: '[REDACTED]',
          port: config.port,
        });
      });

      // Event: Ready
      this.client.on('ready', () => {
        this.isConnected = true;
        this.isConnecting = false;
        log.info('Redis ready for commands', {
          component: 'redis',
        });
      });

      // Event: Error
      this.client.on('error', (error: Error) => {
        this.isConnected = false;
        log.error('Redis connection error', error, {
          component: 'redis',
          host: '[REDACTED]',
        });
      });

      // Event: Close
      this.client.on('close', () => {
        this.isConnected = false;
        log.warn('Redis connection closed', {
          component: 'redis',
        });
      });

      // Event: Reconnecting
      this.client.on('reconnecting', (delay: number) => {
        log.info('Redis reconnecting', {
          component: 'redis',
          delayMs: delay,
        });
      });
    } catch (error) {
      log.error(
        'Failed to initialize Redis client',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'redis',
        }
      );
      this.isConnected = false;
      this.isConnecting = false;
    }
  }

  /**
   * Build Redis configuration from environment variables
   */
  private buildConfig(): RedisConfig {
    const env = process.env.NODE_ENV || 'development';
    const environment = process.env.ENVIRONMENT || env;

    const config: RedisConfig = {
      host: process.env.REDIS_HOST || '',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      tls: process.env.REDIS_TLS === 'true',
      keyPrefix: `bcos:${environment}:`,
      maxRetriesPerRequest: 3,
      // Enable offline queue to handle hot reload scenarios in development
      // Commands will be queued and executed once connection is ready
      // This prevents "Stream isn't writeable" errors during reconnection
      enableOfflineQueue: true,
      retryStrategy: (times: number) => {
        if (times > 10) {
          log.error('Redis retry limit reached, giving up', new Error('Max retries exceeded'), {
            component: 'redis',
            attempts: times,
          });
          return null; // Stop retrying
        }
        // Exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
        const delay = Math.min(times * 100, 5000);
        return delay;
      },
    };

    // Only add optional properties if they have values
    if (process.env.REDIS_USERNAME) {
      config.username = process.env.REDIS_USERNAME;
    }
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    return config;
  }

  /**
   * Gracefully close connection
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        log.info('Redis disconnected gracefully', {
          component: 'redis',
        });
      } catch (error) {
        log.error(
          'Error disconnecting from Redis',
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'redis',
          }
        );
      }
    }
  }
}

// Extend globalThis to include our Redis manager
declare global {
  // eslint-disable-next-line no-var
  var __redisManager: RedisClientManager | undefined;
}

// Use globalThis to ensure single instance across hot reloads in development
// In production, this works the same as a regular singleton
const redisManager = globalThis.__redisManager ?? new RedisClientManager();

// Store on globalThis in development to prevent multiple instances during hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.__redisManager = redisManager;
}

/**
 * Get Redis client singleton
 *
 * @returns Redis client or null if not configured
 */
export function getRedisClient(): Redis | null {
  return redisManager.getClient();
}

/**
 * Check if Redis is available
 *
 * @returns true if Redis is connected and ready
 */
export function isRedisAvailable(): boolean {
  return redisManager.isAvailable();
}

/**
 * Disconnect from Redis (for graceful shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  await redisManager.disconnect();
}
