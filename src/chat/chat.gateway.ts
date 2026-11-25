import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { ChatService } from "./chat.service";
import { MessageType } from "@prisma/client";

@WebSocketGateway({
  namespace: "/chat",
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
        .split(",").map((item) => item.trim()).filter(Boolean);
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(ChatGateway.name);

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private redis: RedisService,
    private chat: ChatService,
  ) {}

  // ============ Connection ============
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        (client.handshake.headers.authorization as string)?.replace(
          "Bearer ",
          "",
        );
      if (!token) throw new Error("no token");

      const payload = await this.jwt.verifyAsync(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.isBanned) throw new Error("bad user");

      client.data.userId = user.id;
      client.join(`user:${user.id}`);
      await this.redis.setOnline(user.id);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      });

      this.server.emit("presence", { userId: user.id, online: true });
      this.log.log(`🔌 Connected: ${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.redis.setOffline(userId);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: now },
    });

    this.server.emit("presence", {
      userId,
      online: false,
      lastSeenAt: now,
    });
    this.log.log(`🔌 Disconnected: ${userId}`);
  }

  // ============ Messages ============
  @SubscribeMessage("message:send")
  async onMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      toUserId: string;
      text: string;
      type?: MessageType;
      mediaUrl?: string;
    },
  ) {
    const from = client.data.userId;
    if (!from) throw new WsException("unauthorized");

    if (await this.chat.isBlockedEitherWay(from, body.toUserId))
      throw new WsException("امکان ارسال پیام وجود ندارد");

    const msg = await this.chat.saveMessage(from, {
      toUserId: body.toUserId,
      text: body.text,
      type: body.type,
      mediaUrl: body.mediaUrl,
    });

    this.server.to(`user:${body.toUserId}`).emit("message:new", msg);
    this.server.to(`user:${from}`).emit("message:new", msg);

    return msg;
  }

  @SubscribeMessage("typing")
  onTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { toUserId: string; typing: boolean },
  ) {
    const from = client.data.userId;
    if (!from) return;
    this.server.to(`user:${body.toUserId}`).emit("typing", {
      from,
      typing: body.typing,
    });
  }

  @SubscribeMessage("message:read")
  async onRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; otherUserId: string },
  ) {
    const from = client.data.userId;
    if (!from) return;

    const result = await this.chat.markConversationAsRead(
      from,
      body.conversationId,
    );

    // ⭐️ تغییر حیاتی: اگر silent بود، هیچ کاری نکن
    if (result.silent) {
      console.log(
        "🚫 [BLOCKED] Read receipt suppressed due to privacy settings.",
      );
      return;
    }

    // اگر اینجا رسیدی، یعنی مجاز است
    const now = new Date().toISOString();

    this.server.to(`user:${body.otherUserId}`).emit("messages:read", {
      conversationId: body.conversationId,
      readAt: now,
      count: result.count,
      readerId: from,
    });

    console.log("📤 [SENT] Read receipt emitted successfully.");
  }

  // ============ Block Events ============
  emitBlockUpdate(
    userId: string,
    payload: {
      userId: string;
      blockedByMe?: boolean;
      blockedByThem?: boolean;
    },
  ) {
    this.server.to(`user:${userId}`).emit("block:update", payload);
  }

  // ============ Conversation Deleted ============
  emitConversationDeleted(participants: string[], conversationId: string) {
    participants.forEach((uid) => {
      this.server
        .to(`user:${uid}`)
        .emit("conversation:deleted", { conversationId });
    });
    this.log.log(
      `🗑️ Conversation ${conversationId} deleted for ${participants.length} participants`,
    );
  }
}
