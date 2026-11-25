import { Module } from "@nestjs/common";
import { PostsService } from "./posts.service";
import { PostsController } from "./posts.controller";
import { PostsGateway } from "./posts.gateway";
import { PrismaModule } from "../prisma/prisma.module"; // ⭐️ افزودن PrismaModule
import { RedisModule } from "../redis/redis.module"; // ⭐️ افزودن RedisModule

@Module({
  imports: [
    PrismaModule, // ⭐️ حتماً اینجا باشد تا Database در دسترس باشد
    RedisModule, // ⭐️ حتماً اینجا باشد تا Cache در دسترس باشد
  ],
  providers: [PostsService, PostsGateway],
  controllers: [PostsController],
  exports: [PostsService, PostsGateway],
})
export class PostsModule {}
