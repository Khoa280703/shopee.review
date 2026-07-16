import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_AUTHOR_SELECT } from '../common/user-select';
import { UsersService } from '../users/users.service';
import { MeilisearchService } from './meilisearch.service';

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
  verified: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly meili: MeilisearchService,
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

  /**
   * Rebuild the entire Meilisearch index from Postgres. Admin-triggered recovery
   * for index drift — indexing is otherwise best-effort (enqueue/job failures are
   * swallowed) and the auto-backfill only runs against an empty index.
   */
  reindexAll(): Promise<number> {
    return this.meili.reindexAll();
  }

  private async searchPosts(query: string, page: number) {
    // Primary: Meilisearch (diacritic-insensitive). Fallback: PostgreSQL FTS.
    if (this.meili.enabled) {
      try {
        const ids = await this.meili.searchPosts(query, page);
        if (ids !== null) {
          return ids.length ? this.loadPostsByIds(ids) : [];
        }
      } catch (error) {
        this.logger.warn(
          `Meili search failed, falling back to PG FTS: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
    return this.ftsSearchPosts(query, page);
  }

  private async loadPostsByIds(ids: number[]) {
    const posts = await this.prisma.post.findMany({
      where: { id: { in: ids } },
      include: { user: { select: PUBLIC_AUTHOR_SELECT } },
    });
    const byId = new Map(posts.map((p) => [p.id, p]));
    // Preserve Meilisearch relevance ordering.
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        images: p.images,
        affiliateUrl: p.affiliateUrl,
        productUrl: p.productUrl,
        productMeta: p.productMeta,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        clickCount: p.clickCount,
        createdAt: p.createdAt,
        user: p.user,
      }));
  }

  private async ftsSearchPosts(query: string, page: number) {
    const offset = (page - 1) * 20;
    const rows = await this.prisma.$queryRaw<PostSearchRow[]>`
      SELECT p.id, p.title, p.content, p.images, p.affiliate_url, p.product_url,
             p.product_meta, p.like_count, p.comment_count, p.click_count, p.created_at,
             u.username, u.display_name, u.avatar_url, u.verified
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
      user: {
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        verified: r.verified,
      },
    }));
  }
}
