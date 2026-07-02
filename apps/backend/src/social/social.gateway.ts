import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

const room = (postId: number | string) => `post:${postId}`;

/**
 * Live comment + like updates over Socket.io. Anonymous clients may connect and
 * receive broadcasts (read-only); a valid JWT in the handshake additionally
 * identifies the user. Mutations still flow through REST — the gateway only
 * broadcasts post-commit events emitted by SocialService.
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:5166')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  },
})
export class SocialGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SocialGateway.name);
  private connections = 0;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket): void {
    this.connections += 1;
    const token = client.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: number; username: string }>(token);
        client.data.userId = payload.sub;
        client.data.username = payload.username;
      } catch {
        // Invalid token → stay connected as anonymous (read-only).
      }
    }
  }

  handleDisconnect(): void {
    this.connections = Math.max(0, this.connections - 1);
  }

  /** For metrics (Phase 8). */
  getConnectionCount(): number {
    return this.connections;
  }

  // Post rooms are intentionally PUBLIC: every post page (incl. logged-out
  // visitors) is readable, and rooms only ever receive broadcasts of
  // already-public events (new/deleted comments, like counts). No private data
  // flows here, so room membership needs no authorization — we only validate
  // the id shape to avoid junk room names.
  @SubscribeMessage('join-post')
  joinPost(client: Socket, postId: number): void {
    const id = Number(postId);
    if (!Number.isInteger(id) || id <= 0) return;
    void client.join(room(id));
  }

  @SubscribeMessage('leave-post')
  leavePost(client: Socket, postId: number): void {
    const id = Number(postId);
    if (!Number.isInteger(id) || id <= 0) return;
    void client.leave(room(id));
  }

  emitNewComment(postId: number, comment: unknown): void {
    this.server?.to(room(postId)).emit('comment:new', comment);
  }

  emitCommentDeleted(postId: number, commentId: number): void {
    this.server?.to(room(postId)).emit('comment:deleted', { commentId });
  }

  emitLikeUpdate(postId: number, likeCount: number): void {
    this.server?.to(room(postId)).emit('like:update', { postId, likeCount });
  }
}
