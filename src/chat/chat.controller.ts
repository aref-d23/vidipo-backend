import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch, // ⭐️ ایمپورت جدید برای PATCH
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ChatService } from "./chat.service";
import { ChatGateway } from "./chat.gateway";
import { JwtGuard } from "../common/guards/jwt.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StartConversationDto } from "./dto/start-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { BlockUserDto } from "./dto/block-user.dto";
import { ReportUserDto } from "./dto/report-user.dto";
import { PrismaService } from "../prisma/prisma.service";

@Controller("chat")
@UseGuards(JwtGuard)
export class ChatController {
  constructor(
    private chat: ChatService,
    private chatGateway: ChatGateway,
    private prisma: PrismaService,
  ) {}

  // ============ Conversations ============
  @Post("conversations")
  start(@CurrentUser("id") userId: string, @Body() dto: StartConversationDto) {
    return this.chat.getOrCreateConversation(userId, dto.userId);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser("id") userId: string) {
    return this.chat.getTotalUnreadCount(userId);
  }

  @Get("conversations")
  list(@CurrentUser("id") userId: string) {
    return this.chat.listConversations(userId);
  }

  @Get("conversations/:id/messages")
  messages(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.chat.getMessages(userId, id, cursor);
  }

  @Post("conversations/:id/read")
  async markAsRead(
    @CurrentUser("id") userId: string,
    @Param("id") conversationId: string,
  ) {
    const result = await this.chat.markConversationAsRead(
      userId,
      conversationId,
    );

    if (result.silent) {
      console.log("🚫 [BLOCKED-CONTROLLER] Read receipt suppressed.");
      return result;
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (conv && this.chatGateway.server) {
      const receiverId = conv.userAId === userId ? conv.userBId : conv.userAId;
      const now = new Date().toISOString();

      this.chatGateway.server.to(`user:${receiverId}`).emit("messages:read", {
        conversationId,
        readAt: now,
        count: result.count,
        readerId: userId,
      });
    }

    return result;
  }

  // ⚡ حذف گفتگو دوطرفه
  @Delete("conversations/:id/for-both")
  async deleteConversationForBoth(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
  ) {
    const result = await this.chat.deleteConversationForBoth(userId, id);
    this.chatGateway.emitConversationDeleted(
      result.participants,
      result.conversationId,
    );
    return { ok: true };
  }

  // حذف گفتگو یک‌طرفه
  @Delete("conversations/:id")
  deleteConversation(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
  ) {
    return this.chat.deleteConversationForMe(userId, id);
  }

  // ============ Messages ============

  // ارسال پیام جدید
  @Post("messages")
  send(@CurrentUser("id") userId: string, @Body() dto: SendMessageDto) {
    return this.chat.saveMessage(userId, dto).then(async (msg) => {
      // ارسال به هر دو طرف
      if (this.chatGateway.server) {
        this.chatGateway.server
          .to(`user:${dto.toUserId}`)
          .emit("message:new", msg);
        this.chatGateway.server.to(`user:${userId}`).emit("message:new", msg);
      }

      // بررسی ریپلای استوری (منطق قبلی حفظ شد)
      if (dto.mediaUrl && dto.type === "TEXT" && dto.toUserId) {
        let senderName = "کاربر";
        try {
          const sender = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true, username: true },
          });
          if (sender)
            senderName = sender.displayName || sender.username || "کاربر";
        } catch (e) {}

        if (this.chatGateway.server) {
          this.chatGateway.server
            .to(`user:${dto.toUserId}`)
            .emit("notification:new", {
              type: "STORY_REPLY",
              title: `${senderName} به استوری شما پاسخ داد`,
              body: dto.text ? dto.text.substring(0, 50) : "یک پیام جدید",
              senderId: userId,
              timestamp: new Date().toISOString(),
            });
        }
      }

      return msg;
    });
  }

  // ⭐️⭐️⭐️ ENDPOINT جدید: ویرایش پیام
  @Patch("messages/:id/edit")
  async editMessage(
    @CurrentUser("id") userId: string,
    @Param("id") messageId: string,
    @Body("text") text: string,
  ) {
    // ۱. ویرایش در دیتابیس
    const updatedMsg = await this.chat.editMessage(userId, messageId, text);

    // ۲. پیدا کردن گیرنده برای ارسال ایونت
    const msgData = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (msgData && this.chatGateway.server) {
      const receiverId =
        msgData.conversation.userAId === userId
          ? msgData.conversation.userBId
          : msgData.conversation.userAId;

      // ارسال ایونت ویرایش به هر دو طرف (تا UI آپدیت شود)
      this.chatGateway.server
        .to(`user:${receiverId}`)
        .emit("message:updated", updatedMsg);
      this.chatGateway.server
        .to(`user:${userId}`)
        .emit("message:updated", updatedMsg);
    }

    return updatedMsg;
  }

  // ⭐️⭐️⭐️ ENDPOINT جدید: حذف پیام برای همه
  @Delete("messages/:id/for-both")
  async deleteMessageForBoth(
    @CurrentUser("id") userId: string,
    @Param("id") messageId: string,
  ) {
    // ۱. حذف از دیتابیس
    await this.chat.deleteMessageForBoth(userId, messageId);

    // ۲. پیدا کردن اطلاعات برای ارسال ایونت
    const msgData = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (msgData && this.chatGateway.server) {
      const receiverId =
        msgData.conversation.userAId === userId
          ? msgData.conversation.userBId
          : msgData.conversation.userAId;

      // ارسال ایونت حذف به هر دو طرف
      this.chatGateway.server
        .to(`user:${receiverId}`)
        .emit("message:deleted", { id: messageId });
      this.chatGateway.server
        .to(`user:${userId}`)
        .emit("message:deleted", { id: messageId });
    }

    return { ok: true };
  }

  // حذف پیام فقط برای خودم (قبلاً وجود داشت)
  @Delete("messages/:id")
  deleteMessage(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.chat.deleteMessageForMe(userId, id);
  }

  // ============ Block & Other Features ============
  @Post("block")
  block(@CurrentUser("id") userId: string, @Body() dto: BlockUserDto) {
    return this.chat.blockUser(userId, dto.userId);
  }

  @Delete("block/:userId")
  unblock(@CurrentUser("id") userId: string, @Param("userId") otherId: string) {
    return this.chat.unblockUser(userId, otherId);
  }

  @Get("blocked")
  blocked(@CurrentUser("id") userId: string) {
    return this.chat.listBlocked(userId);
  }

  @Get("block-status/:userId")
  blockStatus(
    @CurrentUser("id") userId: string,
    @Param("userId") otherId: string,
  ) {
    return this.chat.getBlockStatus(userId, otherId);
  }

  @Post("report")
  report(@CurrentUser("id") userId: string, @Body() dto: ReportUserDto) {
    return this.chat.reportUser(userId, dto);
  }

  @Get("presence/:userId")
  presence(
    @CurrentUser("id") userId: string,
    @Param("userId") otherId: string,
  ) {
    return this.chat.getPresence(userId, otherId);
  }

  @Get("quota/:receiverId")
  async getQuota(
    @CurrentUser("id") userId: string,
    @Param("receiverId") receiverId: string,
  ) {
    return this.chat.canSendMessage(userId, receiverId);
  }
}
