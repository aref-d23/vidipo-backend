import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Body,
} from "@nestjs/common";
import { JwtGuard } from "../common/guards/jwt.guard"; // ⚠️ مطمئن شو نام Guard درست است
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StoriesService } from "./stories.service";
import { CreateStoryDto } from "./dto/create-story.dto";

@Controller("stories")
@UseGuards(JwtGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Post()
  create(@CurrentUser("id") userId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(userId, dto);
  }

  @Get("active")
  getActive(@CurrentUser("id") userId: string) {
    return this.storiesService.getActiveStories(userId);
  }

  @Get(":userId")
  getUserStories(
    @Param("userId") targetUserId: string,
    @CurrentUser("id") currentUserId: string,
  ) {
    console.log(
      `📥 Controller Received Request for Stories of User: ${targetUserId}`,
    );
    return this.storiesService.getUserStories(targetUserId, currentUserId);
  }

  @Post(":id/view")
  markAsViewed(@Param("id") id: string, @CurrentUser("id") userId: string) {
    return this.storiesService.markAsViewed(id, userId);
  }

  @Delete(":id")
  deleteStory(@Param("id") id: string, @CurrentUser("id") userId: string) {
    return this.storiesService.deleteStory(id, userId);
  }

  @Get(":id/viewers")
  getViewers(@Param("id") id: string, @CurrentUser("id") userId: string) {
    return this.storiesService.getStoryViewers(id, userId);
  }

  /**
   * دریافت آمار واکنش‌های یک استوری
   * مسیر: GET /stories/:id/reactions-stats
   */
  @Get(":id/reactions-stats")
  getReactionsStats(
    @Param("id") storyId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.storiesService.getStoryReactionsStats(storyId, userId);
  }

  // ==========================================
  // ✅ ENDPOINT جدید و یکپارچه برای واکنش‌ها (Toggle)
  // ==========================================

  /**
   * ثبت، تغییر یا حذف واکنش روی استوری
   * مسیر: POST /stories/:id/react
   */
  @Post(":id/react")
  toggleStoryReaction(
    @Param("id") storyId: string,
    @CurrentUser("id") userId: string,
    @Body() body: { type: string },
  ) {
    return this.storiesService.toggleStoryReaction(storyId, userId, body.type);
  }
}
