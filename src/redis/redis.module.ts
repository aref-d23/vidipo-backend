// backend/src/redis/redis.module.ts
import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";

@Global() // ✅ جعل ماژول سراسری تا در همه جا قابل تزریق باشد
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
