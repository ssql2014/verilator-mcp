import { caching } from 'cache-manager';
import { join } from 'path';
import { homedir } from 'os';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { logger } from './logger.js';

// @ts-ignore - cache-manager-fs-hash types might be missing
import fsStore from 'cache-manager-fs-hash';

export class CacheManager {
  private cache: any;
  private cacheDir: string;

  constructor() {
    this.cacheDir = join(homedir(), '.verilator-mcp', 'cache');
    this.initializeCache();
  }

  private async initializeCache() {
    // Ensure cache directory exists
    await fs.mkdir(this.cacheDir, { recursive: true });

    this.cache = await caching(fsStore as any, {
      path: this.cacheDir,
      ttl: 60 * 60 * 24, // 24 hours default TTL
      maxsize: 1024 * 1024 * 1024, // 1GB max cache size
      zip: true, // Compress cache files
    } as any);
  }

  async get<T>(key: string, filePath?: string): Promise<T | null> {
    try {
      // Check if file has been modified since cache
      if (filePath) {
        const cacheTime = await this.getCacheTime(key);
        if (cacheTime) {
          const fileStat = await fs.stat(filePath);
          if (fileStat.mtime.getTime() > cacheTime) {
            logger.debug(`Cache invalidated for ${key}: file modified`);
            await this.delete(key);
            return null;
          }
        }
      }

      const value = await this.cache.get(key);
      return value as T | null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    filePath?: string,
    dependencies?: string[]
  ): Promise<void> {
    try {
      const metadata = {
        timestamp: Date.now(),
        filePath,
        dependencies,
      };

      await this.cache.set(key, value);
      await this.cache.set(`${key}:meta`, metadata);

      logger.debug(`Cache set for ${key}`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      await this.cache.del(`${key}:meta`);
      logger.debug(`Cache deleted for ${key}`);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.cache.reset();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  private async getCacheTime(key: string): Promise<number | null> {
    try {
      const metadata = await this.cache.get(`${key}:meta`);
      return metadata?.timestamp || null;
    } catch {
      return null;
    }
  }

  generateKey(...parts: any[]): string {
    const combined = parts.map(p => JSON.stringify(p)).join(':');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // This is a simplified implementation
    // In production, you might want to use a more sophisticated pattern matching
    logger.info(`Invalidating cache entries matching pattern: ${pattern}`);
    // For now, we'll clear the entire cache if a pattern is requested
    await this.clear();
  }

  async getDependencyTime(dependencies: string[]): Promise<number> {
    let maxTime = 0;

    for (const dep of dependencies) {
      try {
        const stat = await fs.stat(dep);
        maxTime = Math.max(maxTime, stat.mtime.getTime());
      } catch {
        // File doesn't exist, ignore
      }
    }

    return maxTime;
  }

  async isValid(key: string, dependencies?: string[]): Promise<boolean> {
    const metadata = await this.cache.get(`${key}:meta`);
    if (!metadata) return false;

    // Check file modification time
    if (metadata.filePath) {
      try {
        const stat = await fs.stat(metadata.filePath);
        if (stat.mtime.getTime() > metadata.timestamp) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // Check dependencies
    if (dependencies || metadata.dependencies) {
      const deps = dependencies || metadata.dependencies;
      const depTime = await this.getDependencyTime(deps);
      if (depTime > metadata.timestamp) {
        return false;
      }
    }

    return true;
  }
}