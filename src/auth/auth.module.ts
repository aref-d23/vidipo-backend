// backend/src/auth/auth.module.ts
import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { JwtGlobalModule } from "../common/jwt/jwt.global.module";
import { CryptoModule } from "../common/crypto/crypto.module"; // ✅ از مرحله قبل

// ✅ ۱. ایمپورت کردن SmsModule
// فرض بر این است که مسیر src/sms/sms.module.ts است. اگر متفاوت بود، اصلاح کنید.
import { SmsModule } from "../sms/sms.module";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtGlobalModule,
    CryptoModule,

    // ✅ ۲. اضافه کردن SmsModule به لیست imports
    // این کار باعث می‌شود SmsService برای AuthService قابل تزریق باشد
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
