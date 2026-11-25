import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreatePostDto } from "./dto/create-post.dto";

@Injectable()
export class PostsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ⭐️ تابع کمکی برای تشخیص Guest
  private isGuest(userId: string | null): boolean {
    return !userId || userId === 'guest-001';
  }

  /**
   * ایجاد پست جدید
   */
  async create(userId: string, dto: CreatePostDto) {
    let finalUserId = userId;

    // ⭐️ منطق تست: تبدیل Guest به کاربر آزمایشی
    if (this.isGuest(userId)) {
      console.log("👻 [TEST MODE] Converting guest to test-user-id");
      finalUserId = 'test-user-id';

      // چک نهایی برای اطمینان از وجود کاربر
      const userExists = await this.prisma.user.findUnique({ where: { id: finalUserId } });
      if (!userExists) {
        throw new ForbiddenException("کاربر آزمایشی یافت نشد! لطفاً دستور SQL مرحله قبل را اجرا کنید.");
      }
    }

    try {
      const post = await this.prisma.post.create({
        data: {
          authorId: finalUserId,
          content: dto.content,
          type: dto.type || "TEXT",
          mediaUrls: dto.mediaUrls || [],
          videoUrl: dto.videoUrl || null,
          thumbnailUrl: dto.thumbnailUrl || null,
          hashtags: dto.hashtags || [],
          category: dto.category || "general",
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });
      return post;
    } catch (error: any) {
      console.error("❌ Post Creation Error:", error.message);
      throw error;
    }
  }

  /**
   * دریافت لیست پست‌ها (Feed) - اصلاح شده برای Guest
   */
  async feed(
    userId: string | null,
    cursor?: string,
    limit: number = 20,
    category?: string,
  ) {
    // اگر کاربر مهمان است، فقط پست‌های عمومی را نشان بده (بدون فیلتر شخصی‌سازی)
    // اما چون ما هنوز User واقعی در DB نداریم، بهترین کار این است که لیست خالی برگردانیم
    // تا سرور خطای دیتابیس ندهد.
    if (this.isGuest(userId)) {
       return []; // لیست خالی برگردان تا اپ کرش نکند
    }

    const whereClause: any = {};
    if (category && category !== "all") {
      whereClause.category = category;
    }

    const posts = await this.prisma.post.findMany({
      where: whereClause,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { comments: true, saves: true },
        },
      },
    });

    const hasNextPage = posts.length > limit;
    const resultPosts = hasNextPage ? posts.slice(0, -1) : posts;

    let userReactionsMap: Record<string, string> = {};
    let totalReactionsCountMap: Record<string, number> = {};

    if (resultPosts.length > 0) {
      const postIds = resultPosts.map((p) => p.id);

      // فقط برای کاربران واقعی واکنش‌ها را چک کن
      try {
        const myReactions = await this.prisma.postReaction.findMany({
          where: { userId: userId!, postId: { in: postIds } },
          select: { postId: true, type: true },
        });
        myReactions.forEach((r) => {
          userReactionsMap[r.postId] = r.type;
        });

        const reactionCounts = await this.prisma.postReaction.groupBy({
          by: ["postId"],
          where: { postId: { in: postIds } },
          _count: { _all: true },
        });
        reactionCounts.forEach((rc) => {
          totalReactionsCountMap[rc.postId] = rc._count._all;
        });
      } catch (e: any) {
        console.error("❌ Error fetching reactions:", e.message);
      }
    }

    return resultPosts.map((p) => {
      const myReactionType = userReactionsMap[p.id] || null;
      const newReactionCount = totalReactionsCountMap[p.id] || 0;

      return {
        id: p.id,
        content: p.content,
        type: p.type,
        mediaUrls: p.mediaUrls,
        videoUrl: p.videoUrl,
        thumbnailUrl: p.thumbnailUrl,
        hashtags: p.hashtags,
        category: p.category,
        createdAt: p.createdAt,
        author: p.author,
        likeCount: newReactionCount,
        commentCount: p._count.comments,
        saveCount: p._count.saves,
        viewCount: p.viewCount,
        myReactionType: myReactionType,
        likedByMe: !!myReactionType,
        nextCursor: hasNextPage ? p.id : null,
        isMine: p.authorId === userId,
      };
    });
  }

  /**
   * دریافت جزئیات یک پست خاص - اصلاح شده برای Guest
   */
  async findOne(id: string, userId: string | null) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        _count: { select: { comments: true, saves: true } },
      },
    });

    if (!post) throw new NotFoundException("پست یافت نشد");

    let totalReactionsCount = 0;
    let myReactionType: string | null = null;

    totalReactionsCount = await this.prisma.postReaction.count({
      where: { postId: id },
    });

    // فقط اگر کاربر واقعی بود، وضعیت لایک خود را چک کن
    if (!this.isGuest(userId)) {
      const myReaction = await this.prisma.postReaction.findFirst({
        where: {
          postId: id,
          userId: userId!,
        },
        select: { type: true },
      });

      if (myReaction) {
        myReactionType = myReaction.type;
      }
    }

    return {
      ...post,
      likeCount: totalReactionsCount,
      commentCount: post._count.comments,
      saveCount: post._count.saves,
      myReactionType: myReactionType,
      likedByMe: !!myReactionType,
      savedByMe: false,
      isMine: !this.isGuest(userId) && post.authorId === userId,
    };
  }

  /**
   * Toggle Reaction on Main Post - اصلاح شده برای Guest
   */
  async toggleReaction(postId: string, userId: string, type: string) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید تا بتوانید واکنش نشان دهید.");
    }

    const existingReaction = await this.prisma.postReaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    let resultType: string | null = null;
    let isReacted = false;

    if (existingReaction) {
      if (existingReaction.type === type) {
        await this.prisma.postReaction.delete({
          where: { id: existingReaction.id },
        });
        resultType = null;
        isReacted = false;
      } else {
        await this.prisma.postReaction.update({
          where: { id: existingReaction.id },
          data: { type },
        });
        resultType = type;
        isReacted = true;
      }
    } else {
      await this.prisma.postReaction.create({
        data: { postId, userId, type },
      });
      resultType = type;
      isReacted = true;
    }

    const totalReactions = await this.prisma.postReaction.count({
      where: { postId },
    });

    return {
      reacted: isReacted,
      type: resultType,
      likeCount: totalReactions,
    };
  }

  async toggleLike(postId: string, userId: string) {
    return this.toggleReaction(postId, userId, "LIKE");
  }

  async toggleSave(postId: string, userId: string) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید.");
    }

    const existing = await this.prisma.postSave.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await this.prisma.postSave.delete({ where: { id: existing.id } });
      return { saved: false };
    } else {
      await this.prisma.postSave.create({ data: { postId, userId } });
      return { saved: true };
    }
  }

  async incrementShareCount(postId: string) {
    await this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
    });
    return { success: true };
  }

  async remove(id: string, userId: string) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید.");
    }

    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("پست یافت نشد");
    if (post.authorId !== userId)
      throw new ForbiddenException("اجازه حذف ندارید");
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  async markSeen(userId: string) {
    if (this.isGuest(userId)) return { success: true };

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastPostsSeenAt: new Date() },
      });
    } catch (e) {}
    return { success: true };
  }

async markReelsSeen(userId: string) {
  if (this.isGuest(userId)) return { success: true };

  try {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastReelsSeenAt: new Date() },
    });
  } catch (e) {}

  return { success: true };
}

  /**
   * ✅ دریافت کامنت‌ها
   */
  async getComments(postId: string, cursor?: string, limit: number = 20) {
    const comments = await this.prisma.comment.findMany({
      where: { postId },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { likes: true },
        },
      },
    });

    const hasNextPage = comments.length > limit;
    const resultComments = hasNextPage ? comments.slice(0, -1) : comments;

    return resultComments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      likeCount: c._count.likes,
      parentId: c.parentId,
      author: {
        id: c.user.id,
        username: c.user.username,
        displayName: c.user.displayName,
        avatarUrl: c.user.avatarUrl,
      },
      nextCursor: hasNextPage ? c.id : null,
    }));
  }

  /**
   * ✅ ایجاد کامنت جدید - اصلاح شده برای Guest
   */
  async createComment(
    postId: string,
    userId: string,
    content: string,
    parentId?: string,
  ) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید تا کامنت بگذارید.");
    }

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("پست یافت نشد");

    if (parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment) throw new NotFoundException("کامنت والد یافت نشد");
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        userId,
        content,
        parentId: parentId || null,
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
      },
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      likeCount: 0,
      author: {
        id: comment.user.id,
        username: comment.user.username,
        displayName: comment.user.displayName,
        avatarUrl: comment.user.avatarUrl,
      },
    };
  }

  /**
   * ✅ Toggle Reaction on Comment - اصلاح شده برای Guest
   */
  async toggleCommentReaction(commentId: string, userId: string, type: string) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید.");
    }

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException("کامنت یافت نشد");

    const existingLike = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existingLike) {
      await this.prisma.commentLike.delete({ where: { id: existingLike.id } });
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      });
      return { reacted: false, type: null };
    } else {
      await this.prisma.commentLike.create({
        data: { commentId, userId },
      });
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
      });
      return { reacted: true, type: "LIKE" };
    }
  }

async getUnseenCount(userId: string) {
  if (this.isGuest(userId)) return { count: 0 };

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { lastPostsSeenAt: true },
  });

  if (!user || !user.lastPostsSeenAt) {
    return { count: 0 };
  }

  const count = await this.prisma.post.count({
    where: {
      createdAt: { gt: user.lastPostsSeenAt },
      isHidden: false,
      type: "TEXT",
    },
  });

  return { count };
}

  async getUnseenReelsCount(userId: string) {
  if (this.isGuest(userId)) return { count: 0 };

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { lastReelsSeenAt: true },
  });

  if (!user || !user.lastReelsSeenAt) {
    return { count: 0 };
  }

  const count = await this.prisma.post.count({
    where: {
      createdAt: { gt: user.lastReelsSeenAt },
      isHidden: false,
      type: "VIDEO",
    },
  });

  return { count };
}

  /**
   * دریافت لیست ریلزها - اصلاح شده برای Guest
   */
  async getReels(
    userId: string | null,
    cursor?: string,
    limit: number = 20,
    category?: string,
  ) {
    if (this.isGuest(userId)) {
       return []; // لیست خالی برگردان
    }

    const whereClause: any = {
      type: "VIDEO",
      isHidden: false,
    };

    if (category && category !== "all") {
      whereClause.category = category;
    }

    const posts = await this.prisma.post.findMany({
      where: whereClause,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { comments: true, saves: true },
        },
      },
    });

    const hasNextPage = posts.length > limit;
    const resultPosts = hasNextPage ? posts.slice(0, -1) : posts;

    let userReactionsMap: Record<string, string> = {};
    let totalReactionsCountMap: Record<string, number> = {};

    if (resultPosts.length > 0) {
      const postIds = resultPosts.map((p) => p.id);

      try {
        const myReactions = await this.prisma.postReaction.findMany({
          where: { userId: userId!, postId: { in: postIds } },
          select: { postId: true, type: true },
        });
        myReactions.forEach((r) => {
          userReactionsMap[r.postId] = r.type;
        });

        const reactionCounts = await this.prisma.postReaction.groupBy({
          by: ["postId"],
          where: { postId: { in: postIds } },
          _count: { _all: true },
        });
        reactionCounts.forEach((rc) => {
          totalReactionsCountMap[rc.postId] = rc._count._all;
        });
      } catch (e: any) {
        console.error("❌ Error fetching reels reactions:", e.message);
      }
    }

    return resultPosts.map((p) => {
      const myReactionType = userReactionsMap[p.id] || null;
      const newReactionCount = totalReactionsCountMap[p.id] || 0;

      return {
        id: p.id,
        content: p.content,
        type: p.type,
        mediaUrls: p.mediaUrls,
        videoUrl: p.videoUrl,
        thumbnailUrl: p.thumbnailUrl,
        hashtags: p.hashtags,
        category: p.category,
        createdAt: p.createdAt,
        author: p.author,
        likeCount: newReactionCount,
        commentCount: p._count.comments,
        saveCount: p._count.saves,
        viewCount: p.viewCount,
        myReactionType: myReactionType,
        likedByMe: !!myReactionType,
        nextCursor: hasNextPage ? p.id : null,
      };
    });
  }

  /**
   * ✅ حذف کامنت - اصلاح شده برای Guest
   */
  async deleteComment(commentId: string, userId: string) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید.");
    }

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });

    if (!comment) {
      throw new NotFoundException("کامنت یافت نشد");
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException("شما اجازه حذف این کامنت را ندارید");
    }

    await this.prisma.comment.delete({
      where: { id: commentId },
    });

    await this.prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });

    return { success: true };
  }

  /**
   * ⭐️⭐️⭐️ ثبت بازدید هوشمند - اصلاح شده برای Guest
   */
  async incrementViewCount(postId: string, userId: string) {
    if (this.isGuest(userId)) {
      return { ok: true, skipped: true };
    }

    console.log(`\n🟢 [VIEW-DEBUG] START: Post=${postId}, User=${userId}`);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { type: true, viewCount: true },
    });

    if (!post) {
      console.warn(`🔴 [VIEW-ERROR] Post NOT FOUND! ID: ${postId}`);
      return { ok: false, message: "post_not_found" };
    }

    const ttl = post.type === "VIDEO" ? 86400 : 3600;
    const cacheKey = `view:${postId}:${userId}`;

    try {
      const alreadyViewed = await this.redis.get(cacheKey);

      if (alreadyViewed) {
        console.log(`⚪ [VIEW-SKIP] Already viewed recently. Skipping.`);
        return { ok: true, skipped: true };
      }

      const updatedPost = await this.prisma.post.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      });

      await this.redis.set(cacheKey, "1", ttl);

      return { ok: true, registered: true, newCount: updatedPost.viewCount };
    } catch (error: unknown) {
      const err = error as any;
      console.error(`🔥 [VIEW-FATAL] Error in Try Block:`, err.message || err);

      try {
        const fallbackUpdate = await this.prisma.post.update({
          where: { id: postId },
          data: { viewCount: { increment: 1 } },
          select: { viewCount: true },
        });
        return { ok: true, fallback: true, newCount: fallbackUpdate.viewCount };
      } catch (dbErr: unknown) {
        const dbError = dbErr as any;
        console.error(`☠️ [VIEW-CRITICAL] Even DB Update Failed:`, dbError.message || dbError);
        return { ok: false, error: dbError.message || "Unknown DB Error" };
      }
    }
  }

  /**
   * ⭐️⭐️⭐️ متد جدید: ویرایش محتوای پست - اصلاح شده برای Guest
   */
  async updatePost(
    postId: string,
    userId: string,
    dto: { content: string; mediaUrls?: string[] },
  ) {
    if (this.isGuest(userId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید.");
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) throw new NotFoundException("پست یافت نشد");

    if (post.authorId !== userId) {
      throw new ForbiddenException("شما اجازه ویرایش این پست را ندارید");
    }

    const updateData: any = {
      content: dto.content,
    };

    if (dto.mediaUrls !== undefined) {
      updateData.mediaUrls = dto.mediaUrls;
    }

    const updatedPost = await this.prisma.post.update({
      where: { id: postId },
      data: updateData,
    });

    return { success: true, post: updatedPost };
  }

  /**
   * ⭐️⭐️⭐️ متد جدید: ثبت گزارش پست - اصلاح شده برای Guest
   */
  async reportPost(
    postId: string,
    reporterId: string,
    reason: string,
    details?: string,
  ) {
    if (this.isGuest(reporterId)) {
      throw new ForbiddenException("لطفاً ابتدا وارد شوید تا گزارش دهید.");
    }

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("پست یافت نشد");

    if (post.authorId === reporterId) {
      throw new ForbiddenException("نمی‌توانید پست خودتان را گزارش کنید.");
    }

    console.log(
      `🚩 REPORT RECEIVED: Post ${postId} reported by User ${reporterId}. Reason: ${reason}. Details: ${details || "-"}`,
    );

    return { success: true, message: "گزارش شما ثبت شد." };
  }
}
