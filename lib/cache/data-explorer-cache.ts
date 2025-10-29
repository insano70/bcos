import { CacheService } from '@/lib/cache/base';
import type { ExecuteQueryResult, TableMetadata } from '@/lib/types/data-explorer';

export class DataExplorerCacheService extends CacheService {
  protected namespace = 'explorer';
  protected defaultTTL = 900; // 15 minutes

  // Query results cache (15 min TTL)
  async cacheQueryResult(queryHash: string, result: ExecuteQueryResult, ttl?: number): Promise<void> {
    const key = this.buildKey('query', queryHash);
    await this.set(key, result, { ttl: ttl ?? this.defaultTTL });
  }

  async getQueryResult(queryHash: string): Promise<ExecuteQueryResult | null> {
    const key = this.buildKey('query', queryHash);
    return this.get<ExecuteQueryResult>(key);
  }

  // Metadata cache (1 hour TTL)
  async cacheTableMetadata(tableId: string, metadata: TableMetadata): Promise<void> {
    const key = this.buildKey('table', tableId);
    await this.set(key, metadata, { ttl: 3600 });
  }

  async getTableMetadata(tableId: string): Promise<TableMetadata | null> {
    const key = this.buildKey('table', tableId);
    return this.get<TableMetadata>(key);
  }

  async invalidateTableMetadata(tableId: string): Promise<void> {
    const key = this.buildKey('table', tableId);
    await this.del(key);
  }

  // Pattern cache (30 min TTL)
  async cachePatterns(patterns: unknown[]): Promise<void> {
    const key = this.buildKey('patterns');
    await this.set(key, patterns, { ttl: 1800 });
  }

  async getPatterns(): Promise<unknown[] | null> {
    const key = this.buildKey('patterns');
    return this.get<unknown[]>(key);
  }

  async invalidateAll(): Promise<void> {
    await this.delPattern(`${this.namespace}:*`);
  }

  // Required abstract method
  async invalidate(..._args: unknown[]): Promise<void> {
    await this.invalidateAll();
  }
}

// Singleton instance
export const dataExplorerCache = new DataExplorerCacheService();


