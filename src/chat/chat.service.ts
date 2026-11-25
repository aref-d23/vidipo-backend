import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MessageType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { FieldCryptoService } from "../common/crypto/field-crypto.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { ReportUserDto } from "./dto/report-user.dto";

// ⭐️ تعریف فیلدهای عمومی برای Select کردن سریع
const USER_BASE_FIELDS = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  lastSeenAt: true,
};

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private crypto: FieldCryptoService,
  ) {}

  // ⭐️ متد کمکی مرکزی برای بررسی اعتبار اشتراک (رفع باگ Timezone)
  private isSubscriptionValid(subscription: any): boolean {
    if (!subscription || subscription.status !== "ACTIVE") return false;

    const endDate = new Date(subscription.endAt);
    const now = new Date();

    if (isNaN(endDate.getTime())) return false;

    return endDate > now;
  }

  // ============ Conversation ============
  async getOrCreateConversation(userAId: string, userBId: string) {
    if (userAId === userBId)
      throw new BadRequestException("نمی‌توانید با خودتان چت کنید");
    if (await this.isBlockedEitherWay(userAId, userBId))
      throw new ForbiddenException("امکان چت وجود ندارد");

    const [a, b] = [userAId, userBId].sort();
    return this.prisma.conversation.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b },
      update: {},
    });
  }

  /**
   * بررسی مجوز ارسال پیام برای کاربران رایگان
   */
  async canSendMessage(
    userId: string,
    receiverId: string,
  ): Promise<{ allowed: boolean; remainingQuota: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (this.isSubscriptionValid(subscription)) {
      return { allowed: true, remainingQuota: 999999 };
    }

    const sentCount = await this.prisma.message.count({
      where: {
        senderId: userId,
        conversation: {
          OR: [
            { userAId: userId, userBId: receiverId },
            { userAId: receiverId, userBId: userId },
          ],
        },
        type: "TEXT",
      },
    });

    const FREE_LIMIT = 2;

    if (sentCount >= FREE_LIMIT) {
      return { allowed: false, remainingQuota: 0 };
    }

    return { allowed: true, remainingQuota: FREE_LIMIT - sentCount };
  }

  // ⭐️⭐️⭐️ اصلاح حیاتی: listConversations با پشتیبانی از Ghost Mode Sync
  async listConversations(userId: string) {
    const convs = await this.prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const result = [];

    for (const c of convs) {
      const otherId = c.userAId === userId ? c.userBId : c.userAId;

      // ۱. خواندن اطلاعات کامل کاربر مقابل شامل اشتراک و تنظیمات حریم خصوصی
      const other = await this.prisma.user.findUnique({
        where: { id: otherId },
        select: {
          ...USER_BASE_FIELDS,
          isGhostMode: true, // ✅ اضافه کردن فیلد شبح
          isVerified: true, // ✅ اضافه کردن فیلد تیک طلایی (از DB)
          subscription: {
            // ✅ اضافه کردن رابطه اشتراک
            select: { status: true, endAt: true },
          },
        },
      });

      if (!other) continue;

      // ۲. محاسبه وضعیت اشتراک و تیک طلایی
      const hasActiveSub = this.isSubscriptionValid(other.subscription);
      const finalIsVerified = hasActiveSub ? true : other.isVerified;

      // ⭐️ متغیر جدید: آیا واقعاً حالت روح فعال است؟ (برای همگام‌سازی لیست)
      const isGhostActive = hasActiveSub && other.isGhostMode;

      // ۳. تعیین وضعیت آنلاین بودن و تاریخ آخرین بازدید (منطق Ghost Mode)
      let isOnline = await this.redis.isOnline(otherId);
      let displayLastSeen: any = other.lastSeenAt;

      if (isGhostActive) {
        isOnline = false; // مخفی کردن آنلاین بودن

        // اگر اخیراً دیده شده، بزن "اخیراَ"
        if (other.lastSeenAt) {
          const hoursSinceSeen =
            (Date.now() - new Date(other.lastSeenAt).getTime()) /
            (1000 * 60 * 60);
          if (hoursSinceSeen < 24) {
            displayLastSeen = "اخیراَ";
          }
        }
      }

      // ۴. پردازش پیام آخر
      const lastMsg = c.messages[0];
      let preview: string | null = null;
      let lastType: MessageType = "TEXT";
      let lastSenderId: string | null = null;
      let lastReadAt: Date | null = null;

      if (lastMsg) {
        const isMine = lastMsg.senderId === userId;
        const isDeleted = isMine ? lastMsg.deletedForA : lastMsg.deletedForB;
        lastType = lastMsg.type;
        lastSenderId = lastMsg.senderId;
        lastReadAt = lastMsg.readAt;

        if (!isDeleted) {
          if (lastMsg.type === "TEXT") {
            try {
              preview = this.crypto.decrypt(
                lastMsg.cipherText,
                lastMsg.iv,
                lastMsg.authTag,
              );
            } catch {
              preview = "—";
            }
          } else if (lastMsg.type === "IMAGE") {
            preview = "📷 عکس";
          } else if (lastMsg.type === "VOICE") {
            preview = "🎤 پیام صوتی";
          } else {
            preview = "📎 فایل";
          }
        }
      }

      // ۵. شمارش نخوانده‌ها
      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: userId },
          readAt: null,
          ...(c.userAId === userId
            ? { deletedForA: false }
            : { deletedForB: false }),
        },
      });

      // ۶. ساخت آبجکت خروجی نهایی

      const userData = {
        id: other.id,
        username: other.username,
        displayName: other.displayName,
        avatarUrl: other.avatarUrl,
        lastSeenAt: displayLastSeen, // مقدار دستکاری شده (اخیراَ یا تاریخ)
        isOnline: isOnline,
        isVerified: finalIsVerified, // تیک آبی
        hasActiveSubscription: hasActiveSub, // ⭐️ تاج VIP
        isGhostModeActive: isGhostActive, // ⭐️ افزودن این خط حیاتی برای همگام‌سازی
      };

      result.push({
        id: c.id,
        user: userData, // ارسال آبجکت تمیز و ایمن
        lastMessagePreview: preview,
        lastMessageType: lastType,
        lastMessageSenderId: lastSenderId,
        lastMessageReadAt: lastReadAt,
        lastMessageAt: lastMsg?.createdAt ?? c.createdAt,
        unreadCount,
      });
    }

    return result;
  }

  // ⚡ شمارش کل پیام‌های نخوانده
  async getTotalUnreadCount(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { id: true, userAId: true, userBId: true },
    });

    let total = 0;
    for (const c of conversations) {
      const isA = c.userAId === userId;
      const count = await this.prisma.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: userId },
          readAt: null,
          ...(isA ? { deletedForA: false } : { deletedForB: false }),
        },
      });
      total += count;
    }

    return { count: total };
  }

  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = 30,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("گفت‌وگو یافت نشد");
    if (conv.userAId !== userId && conv.userBId !== userId)
      throw new ForbiddenException("دسترسی مجاز نیست");

    const isA = conv.userAId === userId;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(isA ? { deletedForA: false } : { deletedForB: false }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return messages
      .map((m) => {
        let text = "";
        if (m.type === "TEXT") {
          try {
            text = this.crypto.decrypt(m.cipherText, m.iv, m.authTag);
          } catch {
            text = "";
          }
        }
        return {
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          text,
          type: m.type,
          mediaUrl: m.mediaUrl,
          readAt: m.readAt,
          createdAt: m.createdAt,
        };
      })
      .reverse();
  }

  // ============ Message ============
  async saveMessage(senderId: string, dto: SendMessageDto) {
    const conv = await this.getOrCreateConversation(senderId, dto.toUserId);

    const textToEncrypt = dto.text && dto.text.length > 0 ? dto.text : " ";
    const enc = this.crypto.encrypt(textToEncrypt);

    const msg = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId,
        cipherText: enc.cipherText,
        iv: enc.iv,
        authTag: enc.authTag,
        type: dto.type ?? MessageType.TEXT,
        mediaUrl: dto.mediaUrl,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { updatedAt: new Date() },
    });

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      text: dto.text ?? "",
      type: msg.type,
      mediaUrl: msg.mediaUrl,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
    };
  }

  // ============ Mark as Read ============
  async markConversationAsRead(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("گفت‌وگو یافت نشد");
    if (conv.userAId !== userId && conv.userBId !== userId)
      throw new ForbiddenException("دسترسی مجاز نیست");

    // ۱. بررسی حریم خصوصی BEFORE updating DB
    const readerUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        hideReadReceipts: true,
        subscription: {
          select: { status: true, endAt: true },
        },
      },
    });

    let shouldUpdateDb = true;
    let isSilent = false;

    if (readerUser) {
      const hasActiveSub = this.isSubscriptionValid(readerUser.subscription);

      if (hasActiveSub && readerUser.hideReadReceipts) {
        shouldUpdateDb = false;
        isSilent = true;
        console.log(
          "✅ [SUCCESS] Silent Mode Activated! Skipping DB update & Event.",
        );
      }
    }

    // ۲. فقط اگر مجاز بود، دیتابیس را آپدیت کن
    if (shouldUpdateDb) {
      const now = new Date();
      await this.prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          readAt: null,
        },
        data: { readAt: now },
      });
      console.log(
        `🔐 [DEBUG] Updated ${conversationId} messages as read in DB.`,
      );
    } else {
      console.log(`🚫 [BLOCKED] Skipped DB update for privacy settings.`);
    }

    return { ok: true, count: shouldUpdateDb ? 1 : 0, silent: isSilent };
  }

  // ============ Delete ============
  async deleteMessageForMe(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!msg) throw new NotFoundException("پیام یافت نشد");

    const isA = msg.conversation.userAId === userId;
    const isB = msg.conversation.userBId === userId;
    if (!isA && !isB) throw new ForbiddenException();

    await this.prisma.message.update({
      where: { id: messageId },
      data: isA ? { deletedForA: true } : { deletedForB: true },
    });

    const after = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (after?.deletedForA && after?.deletedForB) {
      await this.prisma.message.delete({ where: { id: messageId } });
    }
    return { ok: true };
  }

  async deleteConversationForMe(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException();
    if (conv.userAId !== userId && conv.userBId !== userId)
      throw new ForbiddenException();

    const isA = conv.userAId === userId;
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        ...(isA ? { deletedForA: false } : { deletedForB: false }),
      },
      data: isA ? { deletedForA: true } : { deletedForB: true },
    });

    await this.prisma.message.deleteMany({
      where: { conversationId, deletedForA: true, deletedForB: true },
    });

    return { ok: true };
  }

  async deleteConversationForBoth(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException("گفت‌وگو یافت نشد");
    if (conv.userAId !== userId && conv.userBId !== userId)
      throw new ForbiddenException("دسترسی مجاز نیست");

    await this.prisma.message.deleteMany({
      where: { conversationId },
    });

    await this.prisma.conversation.delete({
      where: { id: conversationId },
    });

    return {
      ok: true,
      participants: [conv.userAId, conv.userBId],
      conversationId,
    };
  }

  // ============ Block ============
  async isBlockedEitherWay(a: string, b: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return !!block;
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException();
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
    return { ok: true };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });
    return { ok: true };
  }

  async listBlocked(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: USER_BASE_FIELDS } },
    });
    return blocks.map((b) => b.blocked);
  }

  async getBlockStatus(userId: string, otherId: string) {
    const [blockedByMe, blockedByThem] = await Promise.all([
      this.prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: userId,
            blockedId: otherId,
          },
        },
      }),
      this.prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: otherId,
            blockedId: userId,
          },
        },
      }),
    ]);

    return {
      blockedByMe: !!blockedByMe,
      blockedByThem: !!blockedByThem,
      isBlocked: !!blockedByMe || !!blockedByThem,
    };
  }

  // ============ Report ============
  async reportUser(reporterId: string, dto: ReportUserDto) {
    if (reporterId === dto.userId) throw new BadRequestException();
    await this.prisma.report.create({
      data: {
        reporterId,
        reportedId: dto.userId,
        reason: dto.reason,
        details: dto.details,
      },
    });
    return { ok: true };
  }

  // ============ Presence ============
  async getPresence(userId: string, otherId: string) {
    const blocked = await this.isBlockedEitherWay(userId, otherId);
    if (blocked) throw new ForbiddenException();

    const targetUser = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: {
        id: true,
        lastSeenAt: true,
        isGhostMode: true,
        subscription: {
          select: { status: true, endAt: true },
        },
      },
    });

    if (!targetUser) throw new NotFoundException();

    const isActuallyOnline = await this.redis.isOnline(otherId);
    let showAsOnline = isActuallyOnline;
    let displayLastSeen: string | Date | null = targetUser.lastSeenAt;

    const hasActiveSub = this.isSubscriptionValid(targetUser.subscription);

    if (hasActiveSub && targetUser.isGhostMode) {
      showAsOnline = false;

      if (targetUser.lastSeenAt) {
        const hoursSinceSeen =
          (Date.now() - new Date(targetUser.lastSeenAt).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceSeen < 24) {
          displayLastSeen = "اخیراَ";
        }
      }
    }

    return {
      userId: otherId,
      online: showAsOnline,
      lastSeenAt: displayLastSeen,
    };
  }

  // ============ Edit Message ============
  async editMessage(userId: string, messageId: string, newText: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!msg) throw new NotFoundException("پیام یافت نشد");
    if (msg.senderId !== userId)
      throw new ForbiddenException("شما مالک این پیام نیستید");

    // فقط پیام‌های متنی قابل ویرایش هستند
    if (msg.type !== MessageType.TEXT)
      throw new BadRequestException("فقط متن قابل ویرایش است");

    // رمزنگاری متن جدید
    const enc = this.crypto.encrypt(newText);

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        cipherText: enc.cipherText,
        iv: enc.iv,
        authTag: enc.authTag,
        isEdited: true, // ⭐️ فیلد جدید در Prisma Schema (اگر نداری باید migrate کنی)
        editedAt: new Date(),
      },
    });
  }

  // ============ Delete For Both ============
  async deleteMessageForBoth(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (!msg) throw new NotFoundException("پیام یافت نشد");

    // بررسی عضویت در گفتگو
    if (
      msg.conversation.userAId !== userId &&
      msg.conversation.userBId !== userId
    ) {
      throw new ForbiddenException("دسترسی مجاز نیست");
    }

    // حذف کامل رکورد از دیتابیس (برای هر دو طرف)
    await this.prisma.message.delete({ where: { id: messageId } });

    return { ok: true };
  }
}
