import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

interface PostSearchRow {
  id: number;
  title: string;
  content: string | null;
  images: string[];
  affiliate_url: string;
  product_url: string;
  product_meta: unknown;
  like_count: number;
  comment_count: number;
  click_count: number;
  created_at: Date;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async search(query: string, type: 'posts' | 'users' | 'all', page = 1) {
    const trimmed = query?.trim() ?? '';
    if (!trimmed) {
      return { posts: [], users: [], meta: { page, limit: 20 } };
    }

    const wantPosts = type === 'posts' || type === 'all';
    const wantUsers = type === 'users' || type === 'all';

    const [posts, users] = await Promise.all([
      wantPosts ? this.searchPosts(trimmed, page) : Promise.resolve([]),
      wantUsers ? this.usersService.searchUsers(trimmed) : Promise.resolve([]),
    ]);

    return { posts, users, meta: { page, limit: 20 } };
  }

  private async searchPosts(query: string, page: number) {
    const offset = (page - 1) * 20;
    const rows = await this.prisma.$queryRaw<PostSearchRow[]>`
      SELECT p.id, p.title, p.content, p.images, p.affiliate_url, p.product_url,
             p.product_meta, p.like_count, p.comment_count, p.click_count, p.created_at,
             u.username, u.display_name, u.avatar_url
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE to_tsvector('simple', p.title || ' ' || coalesce(p.content, ''))
        @@ plainto_tsquery('simple', ${query})
      ORDER BY ts_rank(
        to_tsvector('simple', p.title || ' ' || coalesce(p.content, '')),
        plainto_tsquery('simple', ${query})
      ) DESC
      LIMIT 20 OFFSET ${offset}
    `;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      images: r.images,
      affiliateUrl: r.affiliate_url,
      productUrl: r.product_url,
      productMeta: r.product_meta,
      likeCount: r.like_count,
      commentCount: r.comment_count,
      clickCount: r.click_count,
      createdAt: r.created_at,
      user: { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    }));
  }
}
