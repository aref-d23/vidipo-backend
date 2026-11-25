import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { PostsService } from "./posts.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { JwtAuthGuard } from "../common/jwt/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtService } from "@nestjs/jwt";

@Controller("posts")
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly jwtService: JwtService,
  ) {}

  // ⭐️ تابع کمکی برای استخراج UserId با پشتیبانی از حالت Guest
  private extractUserId(req: any): string {
    if (req.user && req.user.id) return req.user.id;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = this.jwtService.verify(token);
        return decoded.sub || decoded.id || 'guest-001';
      } catch (e) {
        return 'guest-001'; // اگر توکن نامعتبر بود، مهمان حساب کن
      }
    }
    return 'guest-001'; // اگر اصلاً توکنی نبود، مهمان حساب کن
  }

  /**
   * ایجاد پست جدید
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post()
  create(
    @Req() req: any, // تغییر دادیم: کل Request را می‌گیریم
    @Body() createPostDto: CreatePostDto,
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.create(userId, createPostDto);
  }

  // ==========================================
  // ⚠️ بخش حیاتی: متدهای با مسیرهای ثابت (Fixed Paths)
  // ==========================================

  /**
   * دریافت لیست پست‌ها (Feed)
   */
  @Get("feed")
  async findAll(
    @Req() req: any,
    @Query("category") category?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: number,
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.feed(userId, cursor, limit || 20, category);
  }

  /**
   * شمارنده پست‌های خوانده نشده (Badge)
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Get("unseen-count")
  getUnseenCount(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.getUnseenCount(userId);
  }

  @Get("reels/unseen-count")
  getUnseenReelsCount(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.getUnseenReelsCount(userId);
  }

  /**
   * دریافت لیست ریلزها (پست‌های ویدیویی)
   */
  @Get("reels")
  async getReels(
    @Req() req: any,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: number,
    @Query("category") category?: string,
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.getReels(userId, cursor, limit || 20, category);
  }

  /**
   * علامت‌گذاری خوانده شده
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post("mark-seen")
  markSeen(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.markSeen(userId);
  }

      @Post("reels/mark-seen")
    markReelsSeen(@Req() req: any) {
      const userId = this.extractUserId(req);
      return this.postsService.markReelsSeen(userId);
  }

  /**
   * حذف یک کامنت
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Delete("comments/:commentId")
  deleteComment(
    @Param("commentId") commentId: string,
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.deleteComment(commentId, userId);
  }

  // ==========================================
  // ⚠️ بخش حساس: متدها با مسیرهای متغیر (:id)
  // ==========================================

  /**
   * دریافت جزئیات یک پست خاص
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.findOne(id, userId);
  }

  /**
   * ویرایش پست
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Patch(":id")
  updatePost(
    @Param("id") id: string,
    @Body() dto: { content: string; mediaUrls?: string[] },
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.updatePost(id, userId, dto);
  }

  /**
   * حذف پست
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.remove(id, userId);
  }

  /**
   * دریافت کامنت‌های یک پست
   */
  @Get(":id/comments")
  getComments(
    @Param("id") postId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: number,
  ) {
    return this.postsService.getComments(postId, cursor, limit || 20);
  }

  /**
   * ارسال کامنت جدید
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/comments")
  createComment(
    @Param("id") postId: string,
    @Req() req: any,
    @Body() body: { content: string; parentId?: string },
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.createComment(
      postId,
      userId,
      body.content,
      body.parentId,
    );
  }

  /**
   * ثبت واکنش روی کامنت
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":postId/comments/:commentId/react")
  reactToComment(
    @Param("commentId") commentId: string,
    @Req() req: any,
    @Body() body: { type: string },
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.toggleCommentReaction(
      commentId,
      userId,
      body.type,
    );
  }

  /**
   * لایک ساده
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/like")
  like(@Param("id") postId: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.toggleLike(postId, userId);
  }

  /**
   * ثبت واکنش روی پست
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/react")
  react(
    @Param("id") postId: string,
    @Req() req: any,
    @Body() body: { type: string },
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.toggleReaction(postId, userId, body.type);
  }

  /**
   * ذخیره/حذف از بوکمارک
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/save")
  save(@Param("id") postId: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    return this.postsService.toggleSave(postId, userId);
  }

  /**
   * افزایش شمارنده اشتراک‌گذاری
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/share")
  share(@Param("id") postId: string) {
    return this.postsService.incrementShareCount(postId);
  }

  /**
   * ثبت بازدید پست
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/view")
  async registerView(
    @Param("id") postId: string,
    @Req() req: any,
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.incrementViewCount(postId, userId);
  }

  /**
   * گزارش پست/ریلز
   */
  // @UseGuards(JwtAuthGuard) // غیرفعال شد برای تست
  @Post(":id/report")
  reportPost(
    @Param("id") postId: string,
    @Req() req: any,
    @Body() body: { reason: string; details?: string },
  ) {
    const userId = this.extractUserId(req);
    return this.postsService.reportPost(
      postId,
      userId,
      body.reason,
      body.details,
    );
  }
}
