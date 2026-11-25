// backend/src/redis/redis.service.ts
import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(cfg: ConfigService) {
    const url = cfg.get<string>("REDIS_URL") || "redis://127.0.0.1:6379";

    this.client = new Redis(url, {
      family: 4, // اجبار به IPv4 برای رفع ECONNRESET در داکر ویندوز
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        if (times < 5)
          this.logger.warn(`[Redis] Retrying connection... Attempt ${times}`);
        return delay;
      },
      lazyConnect: true,
      enableReadyCheck: false,
    });

    this.client.on("error", (err) => {
      this.logger.error(`[Redis] Error: ${err.message}`);
    });

    this.client.on("connect", () => {
      this.logger.log("[Redis] Connected successfully");
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ==========================================
  // متدهای پایه Redis (Wrappers)
  // ==========================================

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * تنظیم مقدار با TTL ایمن
   * ✅ اصلاح حیاتی: پشتیبانی از فرمت قدیمی (key, value, mode, duration)
   * تا کدهای auth.service.ts و posts.service.ts بدون تغییر کار کنند.
   */
  async set(key: string, value: string, ...args: any[]): Promise<any> {
    // حالت ۱: set(key, value, ttlSeconds) -> args[0] is number
    if (args.length === 1 && typeof args[0] === "number") {
      return this.client.setex(key, args[0], value);
    }

    // حالت ۲: set(key, value, "EX", duration) -> args[0] is string, args[1] is number
    if (
      args.length === 2 &&
      typeof args[0] === "string" &&
      typeof args[1] === "number"
    ) {
      const mode = args[0].toUpperCase();
      const duration = args[1];

      if (mode === "EX") {
        return this.client.setex(key, duration, value);
      } else if (mode === "PX") {
        return this.client.psetex(key, duration, value);
      }
    }

    // حالت پیش‌فرض بدون TTL
    return this.client.set(key, value);
  }

  /**
   * بررسی وجود کلید
   * ✅ افزوده شد برای رفع خطا در posts.service.ts
   */
  async exists(...keys: string[]): Promise<number> {
    return this.client.exists(...keys);
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  // ==========================================
  // متدهای Set (برای حضور آنلاین/آفلاین)
  // ==========================================

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.client.sismember(key, member);
  }

  // متدهای تجاری خاص پروژه شما
  async setOnline(userId: string) {
    await this.sadd("presence:online", userId);
  }

  async setOffline(userId: string) {
    await this.srem("presence:online", userId);
  }

  async isOnline(userId: string): Promise<boolean> {
    const result = await this.sismember("presence:online", userId);
    return result === 1;
  }
}
