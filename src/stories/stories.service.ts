import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStoryDto } from "./dto/create-story.dto";
import dayjs from "dayjs";

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  /**
   * ایجاد استوری جدید
   */
  async create(userId: string, dto: CreateStoryDto) {
    const now = new Date();
    const expiresAt = dayjs(now).add(24, "hour").toDate();

    return this.prisma.story.create({
      data: {
        userId,
        mediaUrl: dto.mediaUrl || null,
        caption: dto.caption || "",
        background: dto.background || null,
        duration: dto.duration || 5,
        textOverlays: dto.textOverlays || [],
        drawings: dto.drawings || [],
        stickers: dto.stickers || [],
        closeFriendsOnly: dto.closeFriendsOnly || false,
        createdAt: now,
        expiresAt,
      },
      include: { user: true },
    });
  }

  /**
   * دریافت لیست استوری‌های فعال برای Feed (نوار بالای صفحه)
   * ⭐️⭐️⭐️ نسخه اصلاح شده برای نمایش Badge بینندگان برای همه ⭐️⭐️⭐️
   */
  async getActiveStories(currentUserId: string) {
    const now = new Date();

    // ۱. پیدا کردن فالوینگ‌ها + خود کاربر
    const followingRecords = await this.prisma.follow.findMany({
      where: { followerId: currentUserId },
      select: { followingId: true },
    });

    const targetUserIds = [
      currentUserId,
      ...followingRecords.map((f) => f.followingId),
    ];

    if (targetUserIds.length === 0) return [];

    // ۲. گرفتن استوری‌ها با اطلاعات بیننده و واکنش‌ها
    const stories = await this.prisma.story.findMany({
      where: {
        userId: { in: targetUserIds },
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        views: {
          select: { viewerId: true, viewedAt: true } // گرفتن تمام ویوها
        },
        reactions: {
          select: { type: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (stories.length === 0) return [];

    // ۳. گروه‌بندی اولیه
    const groupedMap = new Map<string, any>();

    for (const story of stories) {
      const ownerId = story.userId;

      if (!groupedMap.has(ownerId)) {
        groupedMap.set(ownerId, {
          id: ownerId,
          user: story.user,
          stories: [],
          latestStoryPreview: story.mediaUrl || story.background,
          isSeen: false,
          storyCount: 0,
          newestCreatedAt: story.createdAt,

          // فیلدهای جدید
          totalViewersCount: 0,       // کل بینندگان یکتا
          unseenViewersCount: 0,      // بینندگان جدید (برای Badge)
          heartsCount: 0,
        });
      }

      const group = groupedMap.get(ownerId)!;
      group.stories.push(story);
      group.storyCount++;

      // محاسبه لایک‌ها
      const heartCountInThisStory = story.reactions.filter(
        (r) => r.type === "HEART",
      ).length;
      group.heartsCount += heartCountInThisStory;

      // جمع کل بینندگان (موقتاً تکراری، بعداً deduplicate می‌کنیم)
      group.totalViewersCount += story.views.length;

      // بررسی اینکه آیا کاربر جاری (بیننده) این استوری را دیده یا نه
      const hasCurrentViewerSeenIt = story.views.some(v => v.viewerId === currentUserId);
      if (!hasCurrentViewerSeenIt && ownerId !== currentUserId) {
         group.isSeen = false;
      } else if (ownerId === currentUserId) {
         group.isSeen = true; // مال خودم همیشه seen هست
      }
    }

    let result = Array.from(groupedMap.values());

    // ۴. محاسبه دقیق Unseen Viewers برای هر گروه
    // ما نیاز داریم بدانیم هر صاحب استوری، آخرین بار کی لیست بینندگان چک کرده؟

    // الف) گرفتن تاریخ آخرین چک برای تمام صاحبان استوری موجود در لیست
    const ownerIds = result.map(g => g.id);
    const usersData = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, lastStoryViewersCheckAt: true },
    });

    const checkDateMap = new Map(usersData.map(u => [u.id, u.lastStoryViewersCheckAt]));

    // ب) برای هر گروه، شمردن بینندگان جدید
    for (const group of result) {
      const storyIds = group.stories.map(s => s.id);
      const ownerId = group.id;

      // تاریخ مرجع: اگر کاربر تا حالا چک نکرده باشد، از زمان صفر شروع کن (همه جدید هستند)
      // اما معمولاً می‌خواهیم فقط کسانی را بشماریم که بعد از آخرین بازدید صاحب استوری آمده‌اند.
      const checkDate = checkDateMap.get(ownerId) || new Date(0);

      // شمردن کاربران یکتا که بعد از checkDate استوری‌های این صاحب را دیده‌اند
      // نکته: خود صاحب استوری را حساب نکن
      const distinctNewViewers = await this.prisma.storyView.findMany({
        where: {
          storyId: { in: storyIds },
          viewerId: { not: ownerId }, // خود صاحب استوری نیست
          viewedAt: { gt: checkDate }, // بعد از آخرین چک صاحب استوری
        },
        select: { viewerId: true },
        distinct: ["viewerId"],
      });

      group.unseenViewersCount = distinctNewViewers.length;

      // اگر بیننده جدیدی نبود، یعنی Badge نباید بیاید.
      // اگر بیننده جدید بود، یعنی حلقه باید قرمز/رنگی باشد (اگر مال خودم نیست).
    }

    // مرتب‌سازی گروه‌ها بر اساس جدیدترین استوری
    result.sort((a, b) => {
      return (
        new Date(b.newestCreatedAt).getTime() -
        new Date(a.newestCreatedAt).getTime()
      );
    });

    return result.map((group) => ({
      id: group.id,
      user: group.user,
      storyCount: group.storyCount,
      latestStoryPreview: group.latestStoryPreview,
      isSeen: group.isSeen,
      viewersCount: group.totalViewersCount, // کل بینندگان
      unseenViewersCount: group.unseenViewersCount, // ⭐️ عدد جدید برای Badge
      heartsCount: group.heartsCount,
    }));
  }

  /**
   * دریافت جزئیات استوری‌های یک کاربر خاص
   */
  async getUserStories(targetUserId: string, currentUserId: string) {
    const now = new Date();

    const stories = await this.prisma.story.findMany({
      where: {
        userId: targetUserId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "asc" }, // قدیمی‌ترین اول
      include: {
        user: true,
        views: {
          where: { viewerId: currentUserId },
          select: { id: true },
        },
        reactions: {
          select: { type: true, userId: true },
        },
      },
    });

    if (stories.length === 0) throw new NotFoundException("استوری‌ای یافت نشد");

    return stories.map((s: any) => {
      const totalReactionsCount = s.reactions.length;
      const myReaction = s.reactions.find((r) => r.userId === currentUserId);

      let mediaType: "IMAGE" | "VIDEO" = "IMAGE";
      if (s.mediaUrl) {
        const lowerUrl = s.mediaUrl.toLowerCase();
        if (lowerUrl.includes(".mp4") || lowerUrl.includes(".mov") || lowerUrl.includes(".webm")) {
          mediaType = "VIDEO";
        }
      }

      return {
        ...s,
        type: mediaType,
        isSeen: s.views && s.views.length > 0,
        myReactionType: myReaction ? myReaction.type : null,
        reactionCount: totalReactionsCount,
      };
    });
  }

  async markAsViewed(storyId: string, viewerId: string) {
    try {
      await this.prisma.storyView.upsert({
        where: { storyId_viewerId: { storyId, viewerId } },
        update: {},
        create: { storyId, viewerId },
      });
      return { ok: true };
    } catch (error: any) {
      console.error("❌ Error saving view:", error.message);
      return { ok: false, message: error.message };
    }
  }

  async deleteStory(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException("استوری یافت نشد");
    if (story.userId !== userId) throw new ForbiddenException("اجازه ندارید");
    await this.prisma.story.delete({ where: { id: storyId } });
    return { success: true };
  }

  async getStoryViewers(storyId: string, currentUserId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { userId: true },
    });

    if (!story) throw new NotFoundException("استوری یافت نشد");
    if (story.userId !== currentUserId) throw new ForbiddenException("اجازه دسترسی ندارید");

    const views = await this.prisma.storyView.findMany({
      where: { storyId, viewerId: { not: currentUserId } },
      orderBy: { viewedAt: "desc" },
      select: { viewerId: true, viewedAt: true },
    });

    if (views.length === 0) return [];

    const viewerIds = [...new Set(views.map((v) => v.viewerId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: viewerIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return views.map((view) => {
      const user = userMap.get(view.viewerId);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        seenAt: view.viewedAt,
      };
    }).filter(Boolean);
  }

  async toggleStoryReaction(storyId: string, userId: string, type: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException("استوری یافت نشد");

    const existingReaction = await this.prisma.storyReaction.findFirst({
      where: { storyId, userId },
    });

    let resultType: string | null = null;
    let isReacted = false;

    if (existingReaction) {
      if (existingReaction.type === type) {
        await this.prisma.storyReaction.delete({ where: { id: existingReaction.id } });
        resultType = null;
        isReacted = false;
      } else {
        await this.prisma.storyReaction.update({
          where: { id: existingReaction.id },
          data: { type },
        });
        resultType = type;
        isReacted = true;
      }
    } else {
      await this.prisma.storyReaction.create({ data: { storyId, userId, type } });
      resultType = type;
      isReacted = true;
    }

    const totalReactions = await this.prisma.storyReaction.count({ where: { storyId } });

    return { reacted: isReacted, type: resultType, reactionCount: totalReactions };
  }

  async cleanupExpired() {
    const now = new Date();
    const deleted = await this.prisma.story.deleteMany({ where: { expiresAt: { lt: now } } });
    return { deleted: deleted.count };
  }

  async getStoryReactionsStats(storyId: string, currentUserId: string) {
    const allReactions = await this.prisma.storyReaction.findMany({
      where: { storyId },
      select: { type: true, userId: true },
    });

    const heartCount = allReactions.filter((r) => r.type === "HEART").length;
    const myReaction = allReactions.find((r) => r.userId === currentUserId);

    return {
      hearts: heartCount,
      totalReactions: allReactions.length,
      myReactionType: myReaction ? myReaction.type : null,
    };
  }
}
