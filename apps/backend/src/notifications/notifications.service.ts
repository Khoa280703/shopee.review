import { Injectable, type MessageEvent } from '@nestjs/common';
import type { NotificationType } from '@app/database';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateNotificationDto {
  recipientId: number;
  type: NotificationType;
  actorId: number;
  postId?: number;
}

const NOTIFICATION_INCLUDE = {
  actor: { select: { username: true, displayName: true, avatarUrl: true } },
  post: { select: { id: true, title: true } },
};

@Injectable()
export class NotificationsService {
  private readonly streams = new Map<number, Subject<MessageEvent>>();

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    if (dto.recipientId === dto.actorId) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: dto.recipientId,
        type: dto.type,
        actorId: dto.actorId,
        postId: dto.postId,
      },
      include: NOTIFICATION_INCLUDE,
    });

    const stream = this.streams.get(dto.recipientId);
    if (stream) {
      stream.next({ data: JSON.stringify(notification) });
    }

    return notification;
  }

  createStream(userId: number): Observable<MessageEvent> {
    let subject = this.streams.get(userId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.streams.set(userId, subject);
    }

    const heartbeat = interval(30000).pipe(map((): MessageEvent => ({ data: 'ping' })));
    return merge(subject.asObservable(), heartbeat);
  }

  list(userId: number, limit = 30) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId },
      include: NOTIFICATION_INCLUDE,
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  async unreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, read: false },
    });
    return { count };
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }
}
