import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import sharp from "sharp";

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  age: true,
  role: true,
  isBanned: true,
  lastSeenAt: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ⭐️ متد کمکی مرکزی برای بررسی اعتبار اشتراک
  private isSubscriptionValid(subscription: any): boolean {
    if (!subscription || subscription.status !== "ACTIVE") return false;

    const endDate = new Date(subscription.endAt);
    const now = new Date();

    if (isNaN(endDate.getTime())) return false;

    return endDate > now;
  }

  async updateLastStoryViewersCheck(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        lastStoryViewersCheckAt: new Date(),
      },
    });
  }

  // ============ Basic ============
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_PUBLIC_SELECT,
        phone: true,
        passwordHash: true,
        isGhostMode: true,
        hideReadReceipts: true,
        isVerified: true,
        subscription: {
          select: { status: true, endAt: true },
        },
      },
    });

    if (!user) throw new NotFoundException("کاربر یافت نشد");

    const hasActiveSub = this.isSubscriptionValid(user.subscription);
    const finalIsVerified = hasActiveSub ? true : user.isVerified;
    const { subscription, passwordHash, ...restOfUser } = user;

    return {
      ...restOfUser,
      hasActiveSubscription: hasActiveSub,
      hasPassword: !!user.passwordHash,
      isVerified: finalIsVerified,
    };
  }

  async getPublic(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_PUBLIC_SELECT,
        isGhostMode: true,
        isVerified: true,
        subscription: {
          select: { status: true, endAt: true },
        },
      },
    });

    if (!user) throw new NotFoundException("کاربر یافت نشد");

    const hasActiveSub = this.isSubscriptionValid(user.subscription);
    const finalIsVerified = hasActiveSub ? true : user.isVerified;
    const { subscription, ...publicUserData } = user;

    let finalLastSeenAt: any = publicUserData.lastSeenAt;

    if (hasActiveSub && user.isGhostMode) {
      const hoursSinceSeen =
        (Date.now() - new Date(publicUserData.lastSeenAt).getTime()) /
        (1000 * 60 * 60);

      if (hoursSinceSeen < 24) {
        finalLastSeenAt = "اخیراً";
      }
    }

    return {
      ...publicUserData,
      lastSeenAt: finalLastSeenAt,
      hasActiveSubscription: hasActiveSub,
      isVerified: finalIsVerified,
    };
  }

  async search(q: string, take = 20) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
        isBanned: false,
      },
      take,
      select: USER_PUBLIC_SELECT,
    });
  }

  // ============ Update Profile ============
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing && existing.id !== userId)
        throw new BadRequestException("این آیدی قبلاً گرفته شده");
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.age !== undefined && { age: dto.age }),
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("فایلی ارسال نشد");
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype))
      throw new BadRequestException("فرمت تصویر مجاز نیست");

    const processed = await sharp(file.buffer)
      .resize(512, 512, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const url = await this.storage.uploadBuffer(
      processed,
      "avatars",
      "image/jpeg",
    );
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      select: USER_PUBLIC_SELECT,
    });
  }

  // ============ Follow ============
  async follow(myId: string, targetId: string) {
    if (myId === targetId) {
      throw new BadRequestException("خودت رو نمی‌تونی فالو کنی");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException("کاربر یافت نشد");

    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: myId,
          followingId: targetId,
        },
      },
      create: { followerId: myId, followingId: targetId },
      update: {},
    });
    return { ok: true, following: true };
  }

  async unfollow(myId: string, targetId: string) {
    await this.prisma.follow.deleteMany({
      where: { followerId: myId, followingId: targetId },
    });
    return { ok: true, following: false };
  }

  async getFollowers(userId: string) {
    const rows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            subscription: {
              select: { status: true, endAt: true },
            },
          },
        },
      },
    });

    return rows.map((r) => {
      const user = r.follower;
      const hasActiveSub = this.isSubscriptionValid(user.subscription);
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isVerified: hasActiveSub ? true : user.isVerified,
        hasActiveSubscription: hasActiveSub,
      };
    });
  }

  async getFollowing(userId: string) {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        following: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            subscription: {
              select: { status: true, endAt: true },
            },
          },
        },
      },
    });

    return rows.map((r) => {
      const user = r.following;
      const hasActiveSub = this.isSubscriptionValid(user.subscription);
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isVerified: hasActiveSub ? true : user.isVerified,
        hasActiveSubscription: hasActiveSub,
      };
    });
  }

  // ============ Mute ============
  async muteUser(myId: string, targetId: string) {
    if (myId === targetId) {
      throw new BadRequestException("خودت رو نمی‌تونی بی‌صدا کنی");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException("کاربر یافت نشد");

    await this.prisma.mute.upsert({
      where: {
        muterId_mutedId: { muterId: myId, mutedId: targetId },
      },
      create: { muterId: myId, mutedId: targetId },
      update: {},
    });
    return { ok: true, muted: true };
  }

  async unmuteUser(myId: string, targetId: string) {
    await this.prisma.mute.deleteMany({
      where: { muterId: myId, mutedId: targetId },
    });
    return { ok: true, muted: false };
  }

  async listMuted(myId: string) {
    const rows = await this.prisma.mute.findMany({
      where: { muterId: myId },
      include: {
        muted: { select: USER_PUBLIC_SELECT },
      },
    });
    return rows.map((r) => r.muted);
  }

  // ============ Profile ============
  async getProfile(viewerId: string, targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        age: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
        isGhostMode: true,
        hideReadReceipts: true,
        isVerified: true,
        likedByCount: true, // ⭐️ افزودن شمارنده لایک به Select
        subscription: {
          select: { status: true, endAt: true },
        },
      },
    });

    if (!user) throw new NotFoundException("کاربر یافت نشد");

    const hasActiveSub = this.isSubscriptionValid(user.subscription);
    const finalIsVerified = hasActiveSub ? true : user.isVerified;

    const [
      postsCount,
      followersCount,
      followingCount,
      isFollowing,
      isMuted,
      totalLikesAgg,
      isLikedByMe, // ⭐️ چک کردن اینکه آیا بیننده، هدف را لایک کرده است؟
    ] = await Promise.all([
      this.prisma.post.count({
        where: { authorId: targetId, isHidden: false },
      }),
      this.prisma.follow.count({ where: { followingId: targetId } }),
      this.prisma.follow.count({ where: { followerId: targetId } }),
      viewerId !== targetId
        ? this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: viewerId,
                followingId: targetId,
              },
            },
          })
        : Promise.resolve(null),
      viewerId !== targetId
        ? this.prisma.mute.findUnique({
            where: {
              muterId_mutedId: {
                muterId: viewerId,
                mutedId: targetId,
              },
            },
          })
        : Promise.resolve(null),
      this.prisma.post.aggregate({
        where: { authorId: targetId },
        _sum: { likeCount: true },
      }),
      // ⭐️ بررسی لایک پروفایل توسط بیننده
      viewerId !== targetId
        ? this.prisma.profileLike.findUnique({
            where: {
              userId_targetId: {
                userId: viewerId,
                targetId: targetId,
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const { subscription, ...publicUserData } = user;

    let finalLastSeenAt: any = publicUserData.lastSeenAt;

    if (hasActiveSub && user.isGhostMode) {
      const hoursSinceSeen =
        (Date.now() - new Date(publicUserData.lastSeenAt).getTime()) /
        (1000 * 60 * 60);

      if (hoursSinceSeen < 24) {
        finalLastSeenAt = "اخیراً";
      }
    }

    return {
      ...publicUserData,
      postsCount,
      followersCount,
      followingCount,
      totalLikes: totalLikesAgg._sum.likeCount ?? 0,
      isFollowing: !!isFollowing,
      isMuted: !!isMuted,
      isMe: viewerId === targetId,
      hasActiveSubscription: hasActiveSub,
      isGhostMode: publicUserData.isGhostMode,
      hideReadReceipts: publicUserData.hideReadReceipts,
      isVerified: finalIsVerified,
      lastSeenAt: finalLastSeenAt,
      isLikedByMe: !!isLikedByMe, // ⭐️ برگرداندن وضعیت لایک به فرانت
    };
  }

  async getUserPosts(targetId: string, viewerId: string) {
    // ۱. گرفتن پست‌ها
    const posts = await this.prisma.post.findMany({
      where: { authorId: targetId, isHidden: false },
      orderBy: { createdAt: "desc" },
      include: {
        // اگر نیاز به اطلاعات دیگری داری اینجا اضافه کن
      },
    });

    if (posts.length === 0) return [];

    const postIds = posts.map((p) => p.id);

    // ۲. گرفتن تعداد کل واکنش‌ها برای هر پست
    const reactionCounts = await this.prisma.postReaction.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds } },
      _count: { _all: true },
    });

    const countMap: Record<string, number> = {};
    reactionCounts.forEach((rc) => {
      countMap[rc.postId] = rc._count._all;
    });

    // ۳. ⭐️⭐️⭐️ حیاتی: گرفتن نوع واکنش کاربر جاری (viewerId) روی این پست‌ها ⭐️⭐️⭐️
    let myReactionsMap: Record<string, string> = {};

    if (viewerId) {
      const myReactions = await this.prisma.postReaction.findMany({
        where: {
          userId: viewerId,
          postId: { in: postIds },
        },
        select: { postId: true, type: true },
      });

      myReactions.forEach((r) => {
        myReactionsMap[r.postId] = r.type;
      });
    }

    // ۴. ترکیب داده‌ها و برگرداندن فرمت کامل
    return posts.map((p) => ({
      id: p.id,
      type: p.type,
      content: p.content,
      mediaUrls: p.mediaUrls,
      videoUrl: p.videoUrl,
      thumbnailUrl: p.thumbnailUrl,
      hashtags: p.hashtags,
      category: p.category,
      createdAt: p.createdAt,

      // ⭐️ شمارنده واقعی از دیتابیس
      likeCount: countMap[p.id] || 0,

      commentCount: 0, // اگر نیاز داری اینجا حساب کن، فعلاً صفر گذاشتیم برای سرعت
      saveCount: 0,
      viewCount: p.viewCount,

      // ⭐️ وضعیت واکنش کاربر جاری
      myReactionType: myReactionsMap[p.id] || null,
      likedByMe: !!myReactionsMap[p.id],

      isMine: p.authorId === viewerId,
    }));
  }

  // ============ Saved Posts ============
  async getSavedPosts(viewerId: string) {
    const saves = await this.prisma.postSave.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        post: {
          include: {
            author: { select: USER_PUBLIC_SELECT },
            likes: { where: { userId: viewerId }, select: { id: true } },
          },
        },
      },
    });

    return saves
      .filter((s) => s.post && !s.post.isHidden)
      .map((s) => ({
        id: s.post.id,
        type: s.post.type,
        content: s.post.content,
        mediaUrls: s.post.mediaUrls,
        videoUrl: s.post.videoUrl,
        thumbnailUrl: s.post.thumbnailUrl,
        hashtags: s.post.hashtags,
        likeCount: s.post.likeCount,
        commentCount: s.post.commentCount,
        shareCount: s.post.shareCount,
        saveCount: s.post.saveCount,
        viewCount: s.post.viewCount,
        createdAt: s.post.createdAt,
        author: s.post.author,
        likedByMe: s.post.likes.length > 0,
        savedByMe: true,
        isMine: s.post.authorId === viewerId,
      }));
  }

  async updatePrivacySettings(userId: string, dto: UpdateSettingsDto) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { status: true, endAt: true },
    });

    const isPremium = this.isSubscriptionValid(sub);

    if (!isPremium) {
      throw new ForbiddenException("این قابلیت فقط برای اعضای ویژه است.");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.isGhostMode !== undefined && { isGhostMode: dto.isGhostMode }),
        ...(dto.hideReadReceipts !== undefined && {
          hideReadReceipts: dto.hideReadReceipts,
        }),
      },
      select: {
        isGhostMode: true,
        hideReadReceipts: true,
      },
    });
  }

  // ============ Profile Likes ============

  /**
   * تغییر وضعیت لایک پروفایل (لایک یا حذف لایک)
   */
  async toggleLikeProfile(likerId: string, targetId: string) {
    if (likerId === targetId) {
      throw new BadRequestException("نمی‌توانید پروفایل خودتان را لایک کنید");
    }

    // ۱. بررسی وجود لایک قبلی
    const existingLike = await this.prisma.profileLike.findUnique({
      where: {
        userId_targetId: {
          userId: likerId,
          targetId: targetId,
        },
      },
    });

    let isLiked = false;
    let count = 0;

    if (existingLike) {
      // --- حالت حذف لایک (Un-like) ---
      await this.prisma.$transaction([
        this.prisma.profileLike.delete({
          where: { id: existingLike.id },
        }),
        this.prisma.user.update({
          where: { id: targetId },
          data: { likedByCount: { decrement: 1 } },
        }),
      ]);

      isLiked = false;
    } else {
      // --- حالت لایک جدید (Like) ---
      await this.prisma.$transaction([
        this.prisma.profileLike.create({
          data: {
            userId: likerId,
            targetId: targetId,
          },
        }),
        this.prisma.user.update({
          where: { id: targetId },
          data: { likedByCount: { increment: 1 } },
        }),
      ]);

      isLiked = true;
    }

    // ۲. دریافت تعداد نهایی برای بازگشت به فرانت
    const updatedTargetUser = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { likedByCount: true },
    });

    count = updatedTargetUser?.likedByCount ?? 0;

    return { isLiked, count };
  }

  /**
   * چک کردن اینکه آیا کاربر جاری، هدف را لایک کرده است؟
   */
  async checkIfLikedByMe(likerId: string, targetId: string): Promise<boolean> {
    const like = await this.prisma.profileLike.findUnique({
      where: {
        userId_targetId: {
          userId: likerId,
          targetId: targetId,
        },
      },
    });
    return !!like;
  }

  /**
   * ⭐️⭐️⭐️ متد جدید: دریافت لیست کاربرانی که پروفایل هدف را لایک کرده‌اند ⭐️⭐️⭐️
   */
  async getProfileLikers(targetId: string) {
    const likes = await this.prisma.profileLike.findMany({
      where: { targetId },
      orderBy: { createdAt: "desc" },
      take: 100, // حداکثر ۱۰۰ نفر اول
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            subscription: {
              select: { status: true, endAt: true },
            },
          },
        },
      },
    });

    // تبدیل داده‌ها به فرمت مورد نیاز فرانت‌اند (با محاسبه تیک طلایی)
    return likes.map((like) => {
      const hasActiveSub = this.isSubscriptionValid(like.user.subscription);
      return {
        id: like.user.id,
        username: like.user.username,
        displayName: like.user.displayName,
        avatarUrl: like.user.avatarUrl,
        isVerified: hasActiveSub ? true : like.user.isVerified,
        hasActiveSubscription: hasActiveSub,
      };
    });
  }
}
