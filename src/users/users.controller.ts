import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { JwtGuard } from "../common/guards/jwt.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@Controller("users")
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  // ============ Basic ============
  @Get("me")
  me(@CurrentUser("id") userId: string) {
    return this.users.me(userId);
  }

  @Patch("me")
  update(@CurrentUser("id") userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadAvatar(
    @CurrentUser("id") userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.users.uploadAvatar(userId, file);
  }

  @Post("me/mark-story-viewers-seen")
  markStoryViewersSeen(@CurrentUser("id") userId: string) {
    return this.users.updateLastStoryViewersCheck(userId);
  }

  @Patch("me/settings")
  updateSettings(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.users.updatePrivacySettings(userId, dto);
  }

  // ============ Saved Posts ============
  @Get("me/saved")
  getSaved(@CurrentUser("id") userId: string) {
    return this.users.getSavedPosts(userId);
  }

  // ============ Follow Lists ============
  @Get("me/followers")
  myFollowers(@CurrentUser("id") userId: string) {
    return this.users.getFollowers(userId);
  }

  @Get("me/following")
  myFollowing(@CurrentUser("id") userId: string) {
    return this.users.getFollowing(userId);
  }

  // ============ Mute Lists ============
  @Get("me/muted")
  myMuted(@CurrentUser("id") userId: string) {
    return this.users.listMuted(userId);
  }

  // ============ Search ============
  @Get("search")
  search(@Query("q") q: string) {
    if (!q) return [];
    return this.users.search(q);
  }

  // ============ Profile ============
  @Get(":id/profile")
  getProfile(@CurrentUser("id") viewerId: string, @Param("id") id: string) {
    return this.users.getProfile(viewerId, id);
  }

  @Get(":id/posts")
  getUserPosts(@CurrentUser("id") viewerId: string, @Param("id") id: string) {
    return this.users.getUserPosts(id, viewerId);
  }

  @Get(":id/followers")
  getFollowers(@Param("id") id: string) {
    return this.users.getFollowers(id);
  }

  @Get(":id/following")
  getFollowing(@Param("id") id: string) {
    return this.users.getFollowing(id);
  }

  // ⭐️⭐️⭐️ ENDPOINT جدید برای لیست لایک‌کنندگان ⭐️⭐️⭐️
  @Get(":id/profile-likers")
  getProfileLikers(@Param("id") id: string) {
    return this.users.getProfileLikers(id);
  }

  // ============ Follow / Unfollow ============
  @Post(":id/follow")
  follow(@CurrentUser("id") myId: string, @Param("id") targetId: string) {
    return this.users.follow(myId, targetId);
  }

  @Delete(":id/follow")
  unfollow(@CurrentUser("id") myId: string, @Param("id") targetId: string) {
    return this.users.unfollow(myId, targetId);
  }

  // ============ Mute / Unmute ============
  @Post(":id/mute")
  mute(@CurrentUser("id") myId: string, @Param("id") targetId: string) {
    return this.users.muteUser(myId, targetId);
  }

  @Delete(":id/mute")
  unmute(@CurrentUser("id") myId: string, @Param("id") targetId: string) {
    return this.users.unmuteUser(myId, targetId);
  }

  // ============ Like Profile ============
  @Post(":id/like")
  async toggleLike(
    @CurrentUser("id") userId: string,
    @Param("id") targetId: string,
  ) {
    return this.users.toggleLikeProfile(userId, targetId);
  }

  @Get(":id/check-like")
  async checkLike(
    @CurrentUser("id") userId: string,
    @Param("id") targetId: string,
  ) {
    const isLiked = await this.users.checkIfLikedByMe(userId, targetId);
    return { isLiked };
  }

  // ============ Get One (آخر) ============
  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.users.getPublic(id);
  }
}
