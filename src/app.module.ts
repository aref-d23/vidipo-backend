// backend/src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import configuration from "./config/configuration";

// ۱. ماژول‌های پایه زیرساختی
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module"; // ✅ THIS LINE WAS MISSING!
import { JwtGlobalModule } from "./common/jwt/jwt.global.module";
import { ScheduleModule } from "@nestjs/schedule";

// ۲. ماژول‌های تجاری (Features)
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { PostsModule } from "./posts/posts.module";
import { ChatModule } from "./chat/chat.module";
import { StoriesModule } from "./stories/stories.module";
import { UploadsModule } from "./uploads/uploads.module";
import { SubscriptionModule } from "./subscription/subscription.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    // تنظیمات محیطی
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),

    // زیرساخت‌ها (Infrastructure)
    PrismaModule,
    RedisModule,
    StorageModule, // ✅ اضافه شد تا Global شود و در دسترس همه باشد
    JwtGlobalModule,
    ScheduleModule.forRoot(),

    // فیچرها (Business Logic)
    AuthModule,
    UsersModule,
    PostsModule,
    ChatModule,
    StoriesModule,
    UploadsModule,
    SubscriptionModule,
    AdminModule,
  ],
})
export class AppModule {}
