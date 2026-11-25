// backend/src/stories/stories.module.ts
import { Module } from "@nestjs/common";
import { StoriesService } from "./stories.service";
import { StoriesController } from "./stories.controller";
import { StoriesCron } from "./stories.cron"; // اگر این فایل وجود ندارد، این خط را حذف کنید

@Module({
  providers: [StoriesService, StoriesCron],
  controllers: [StoriesController],
  exports: [StoriesService],
})
export class StoriesModule {}
