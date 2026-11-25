import { Logger } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

@WebSocketGateway({
  namespace: "/",
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
        .split(",").map((item) => item.trim()).filter(Boolean);
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  },
})
export class PostsGateway {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(PostsGateway.name);

  emitNewPost(post: any) {
    this.log.log(`📝 New post: ${post.id} by ${post.authorId}`);
    if (!this.server) {
      this.log.warn("PostsGateway server not ready, skipping emit");
      return;
    }
    this.server.emit("post:new", {
      postId: post.id,
      authorId: post.authorId,
      type: post.type,
    });
  }
}
