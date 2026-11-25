import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { StoriesService } from "./stories.service";

@Injectable()
export class StoriesCron {
  private readonly log = new Logger(StoriesCron.name);
  constructor(private stories: StoriesService) {}

  @Cron("0 * * * *")
  async cleanup() {
    const { deleted } = await this.stories.cleanupExpired();
    if (deleted > 0) this.log.log("🗑️  Cleaned up " + deleted + " expired stories");
  }
}