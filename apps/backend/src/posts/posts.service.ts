import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { PUBLIC_AUTHOR_SELECT } from '../common/user-select';
import { NotificationsService } from '../notifications/notifications.service';
import {
  INDEX_JOB,
  INDEX_QUEUE,
  SCRAPER_JOB,
  SCRAPER_QUEUE,
} from '../queue/queue.constants';
import { MeilisearchService } from '../search/meilisearch.service';
import {
  normalizeShopeeUrl,
  SCRAPER_PROVIDER,
  type ScraperProvider,
} from '../scraper/scraper-provider.interface';
import type { ScrapedDealData } from '../scraper/types/scraped-deal-data';
import {
  assertShopeeAffiliateUrl,
  assertShopeeProductUrl,
} from '../common/shopee-url';
import { CreatePostDto } from './dto/create-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';

export interface ScrapeJobResult {
  status: 'queued' | 'active' | 'completed' | 'failed' | 'unknown';
  data?: ScrapedDealData;
  error?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FEED_CACHE_TTL_MS = 60 * 1000;

const POST_INCLUDE = {
  user: { select: PUBLIC_AUTHOR_SELECT },
  category: true,
} satisfies Prisma.PostInclude;

type RawPostRow = {
  id: number;
  user_id: number;
  title: string;
  content: string | null;
  product_url: string;
  affiliate_url: string;
  product_meta: unknown;
  images: string[];
  category_id: number | null;
  like_count: number;
  comment_count: number;
  click_count: number;
  share_count?: number;
  created_at: Date;
  updated_at: Date;
  username: string;
  display_name: string;
  avatar_url: string | null;
  verified: boolean;
};

function mapRawPostRow({
  username,
  display_name,
  avatar_url,
  verified,
  ...row
}: RawPostRow) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: row.content,
    productUrl: row.product_url,
    affiliateUrl: row.affiliate_url,
    productMeta: row.product_meta,
    images: row.images,
    categoryId: row.category_id,
    likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count),
    clickCount: Number(row.click_count),
    shareCount: Number(row.share_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: { username, displayName: display_name, avatarUrl: avatar_url, verified },
  };
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCRAPER_PROVIDER) private readonly scraperProvider: ScraperProvider,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly notifications: NotificationsService,
    private readonly meili: MeilisearchService,
    @Optional()
    @InjectQueue(SCRAPER_QUEUE)
    private readonly scraperQueue?: Queue,
    @Optional()
    @InjectQueue(INDEX_QUEUE)
    private readonly indexQueue?: Queue,
  ) {}

  // Async Meilisearch sync when a queue exists; otherwise index inline
  // (best-effort, never throws into the request path).
  private async syncSearchIndex(
    op: 'upsert' | 'delete',
    postId: number,
  ): Promise<void> {
    try {
      if (this.indexQueue) {
        await this.indexQueue.add(
          op === 'upsert' ? INDEX_JOB.UPSERT : INDEX_JOB.DELETE,
          { postId },
        );
        return;
      }
      if (!this.meili.enabled) return;
      if (op === 'upsert') await this.meili.indexPost(postId);
      else await this.meili.deletePost(postId);
    } catch {
      // Search index sync is best-effort.
    }
  }

  private async cached<T>(
    key: string,
    fn: () => Promise<T>,
    // shouldCache guards against persisting an EMPTY result: if the DB was briefly
    // empty (fresh deploy, mid-seed) an empty feed would otherwise stick for the
    // full TTL even after data exists. Default caches everything.
    opts: { ttl?: number; shouldCache?: (result: T) => boolean } = {},
  ): Promise<T> {
    const { ttl = FEED_CACHE_TTL_MS, shouldCache } = opts;
    // Cache is best-effort: a Redis error (e.g. the shared noeviction instance
    // filling up) must DEGRADE to a direct DB read, never 500 the whole feed.
    try {
      const hit = await this.cache.get<T>(key);
      if (hit !== undefined && hit !== null) return hit;
    } catch (e) {
      this.logger.warn(`cache get failed for ${key}: ${e instanceof Error ? e.message : e}`);
    }
    const result = await fn();
    if (!shouldCache || shouldCache(result)) {
      try {
        await this.cache.set(key, result, ttl);
      } catch (e) {
        this.logger.warn(`cache set failed for ${key}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return result;
  }

  async findAll(dto: QueryPostsDto) {
    const limit = dto.limit ?? 20;
    // Free-text search goes through the Postgres FTS GIN index (posts_search_idx)
    // via a raw query — the previous ILIKE '%term%' could not use any index and
    // seq-scanned the whole table. Keyset-paginated by id to keep the contract.
    if (dto.search) {
      return this.querySearch(dto.search, dto.cursor, limit, dto.categoryId);
    }
    const where: Prisma.PostWhereInput = {};
    if (dto.categoryId) where.categoryId = dto.categoryId;

    // Always tie-break by unique id so cursor pagination is STABLE. Ordering by
    // a non-unique column (likeCount/clickCount) without a tiebreaker made the
    // id-based cursor skip/duplicate rows across pages. With the compound
    // orderBy, Prisma derives the correct keyset from the cursor row's values.
    const sortBy = dto.sortBy ?? 'createdAt';
    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      sortBy === 'createdAt' ? [{ id: 'desc' }] : [{ [sortBy]: 'desc' }, { id: 'desc' }];

    const posts = await this.prisma.post.findMany({
      where,
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      orderBy,
      include: POST_INCLUDE,
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async findOne(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    return post;
  }

  async findExplore(offset: number, limit: number, categoryId?: number) {
    const key = `explore:${categoryId ?? 'all'}:${offset}:${limit}`;
    return this.cached(key, () => this.queryExplore(offset, limit, categoryId), {
      shouldCache: (r) => r.data.length > 0,
    });
  }

  private async queryExplore(offset: number, limit: number, categoryId?: number) {
    // Bound the scan to the last 30 days (same window as the trending MV). The
    // scoring formula already zeroes recency bonuses after 7 days, so older
    // posts only ranked by raw counters — dropping them keeps "explore" fresh
    // and makes cost independent of total table size (uses created_at index).
    const recent = Prisma.sql`p.created_at > NOW() - INTERVAL '30 days'`;
    const whereClause = categoryId
      ? Prisma.sql`WHERE p.category_id = ${categoryId} AND ${recent}`
      : Prisma.sql`WHERE ${recent}`;

    const rows = await this.prisma.$queryRaw<RawPostRow[]>`
      SELECT
        p.*,
        u.username,
        u.display_name,
        u.avatar_url,
        u.verified,
        (
          p.like_count    * 3 +
          p.comment_count * 5 +
          p.click_count   * 2 +
          CASE WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 30 ELSE 0 END +
          CASE WHEN p.created_at > NOW() - INTERVAL '48 hours' THEN 15 ELSE 0 END +
          CASE WHEN p.created_at > NOW() - INTERVAL '7 days'  THEN  5 ELSE 0 END
        ) AS score
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ${whereClause}
      ORDER BY score DESC, p.id DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `;

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return {
      data: data.map(mapRawPostRow),
      nextCursor: hasMore ? offset + limit : null,
    };
  }

  // Index-backed full-text search (posts_search_idx GIN on the same 'simple'
  // to_tsvector expression). Keyset by id DESC so pagination stays stable.
  private async querySearch(
    search: string,
    cursor: number | undefined,
    limit: number,
    categoryId?: number,
  ) {
    const match = Prisma.sql`to_tsvector('simple', p.title || ' ' || coalesce(p.content, '')) @@ plainto_tsquery('simple', ${search})`;
    const catClause = categoryId ? Prisma.sql`AND p.category_id = ${categoryId}` : Prisma.empty;
    const cursorClause = cursor ? Prisma.sql`AND p.id < ${cursor}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawPostRow[]>`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE ${match} ${catClause} ${cursorClause}
      ORDER BY p.id DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: data.map(mapRawPostRow),
      nextCursor: hasMore ? data[data.length - 1].id : null,
    };
  }

  async getTrending(limit = 20) {
    return this.cached(`trending:${limit}`, () => this.queryTrending(limit), {
      shouldCache: (r) => r.length > 0,
    });
  }

  private async queryTrending(limit = 20) {
    // Reads the precomputed materialized view (refreshed every 5 min by
    // TrendingRefreshService) instead of aggregating live. User fields are
    // joined fresh so display names/avatars are always current.
    const rows = await this.prisma.$queryRaw<RawPostRow[]>`
      SELECT
        mv.*,
        u.username,
        u.display_name,
        u.avatar_url,
        u.verified
      FROM trending_posts_mv mv
      JOIN users u ON u.id = mv.user_id
      ORDER BY mv.score DESC, mv.id DESC
      LIMIT ${limit}
    `;

    return rows.map(mapRawPostRow);
  }

  async create(user: AuthUser, dto: CreatePostDto) {
    if (!user.emailVerified) {
      throw new ForbiddenException('Vui lòng xác minh email trước khi đăng bài');
    }
    // Block open-redirect: productUrl must be a real Shopee product; affiliateUrl
    // may be the user's own affiliate/short link but its destination must be Shopee.
    assertShopeeProductUrl(dto.productUrl);
    assertShopeeAffiliateUrl(dto.affiliateUrl);
    const post = await this.prisma.post.create({
      data: {
        userId: user.id,
        title: dto.title,
        content: dto.content,
        productUrl: dto.productUrl,
        affiliateUrl: dto.affiliateUrl,
        productMeta: (dto.productMeta as Prisma.InputJsonValue) ?? undefined,
        images: dto.images,
        categoryId: dto.categoryId,
      },
      include: POST_INCLUDE,
    });

    // Notify followers (queued fan-out for high-follower users, inline otherwise).
    void this.notifications.fanoutNewPost(user.id, post.id);
    void this.syncSearchIndex('upsert', post.id);

    return post;
  }

  async update(userId: number, postId: number, dto: UpdatePostDto) {
    await this.assertOwner(userId, postId);
    if (dto.productUrl !== undefined) assertShopeeProductUrl(dto.productUrl);
    if (dto.affiliateUrl !== undefined) assertShopeeAffiliateUrl(dto.affiliateUrl);
    const post = await this.prisma.post.update({
      where: { id: postId },
      data: {
        ...dto,
        productMeta: dto.productMeta as Prisma.InputJsonValue | undefined,
      },
      include: POST_INCLUDE,
    });
    void this.syncSearchIndex('upsert', postId);
    return post;
  }

  async remove(userId: number, postId: number) {
    await this.assertOwner(userId, postId);
    await this.deletePost(postId);
  }

  /** Admin deletion — no ownership check (caller is behind AdminGuard). */
  async adminRemovePost(postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    await this.deletePost(postId);
    return { success: true };
  }

  // Shared deletion side-effects (delete row + search-index sync). Ownership is
  // enforced by callers, NOT by a bypass flag (avoids a boolean IDOR trap).
  private async deletePost(postId: number) {
    await this.prisma.post.delete({ where: { id: postId } });
    void this.syncSearchIndex('delete', postId);
  }

  private async assertOwner(userId: number, postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true },
    });
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bài viết này');
    }
  }

  private assertShopeeUrl(url: string): void {
    // Scrape entrypoint accepts any Shopee URL (product or short link); the
    // affiliate-destination check is enforced on post create/update instead.
    assertShopeeAffiliateUrl(url);
  }

  /**
   * Async scrape entrypoint. With Redis/queue (prod): enqueue and return a jobId
   * for the client to poll. Without a queue (host dev): run synchronously and
   * return the scraped data directly — both shapes handled by the API client.
   */
  async requestScrape(url: string): Promise<{ jobId: string } | ScrapedDealData> {
    this.assertShopeeUrl(url);
    if (this.scraperQueue) {
      const job = await this.scraperQueue.add(SCRAPER_JOB.SCRAPE, { url });
      return { jobId: String(job.id) };
    }
    return this.scrapeUrl(url);
  }

  async getScrapeResult(jobId: string): Promise<ScrapeJobResult> {
    if (!this.scraperQueue) {
      throw new NotFoundException('Hàng đợi scrape không khả dụng');
    }
    const job = await this.scraperQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Không tìm thấy job');
    }
    const state = await job.getState();
    if (state === 'completed') {
      return { status: 'completed', data: job.returnvalue as ScrapedDealData };
    }
    if (state === 'failed') {
      return { status: 'failed', error: job.failedReason };
    }
    if (state === 'active') return { status: 'active' };
    if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
      return { status: 'queued' };
    }
    return { status: 'unknown' };
  }

  async scrapeUrl(url: string): Promise<ScrapedDealData> {
    const normalized = normalizeShopeeUrl(url);

    const cached = await this.prisma.scrapedProduct.findUnique({
      where: { productUrl: normalized },
    });
    if (cached && Date.now() - cached.scrapedAt.getTime() < CACHE_TTL_MS) {
      return cached.data as unknown as ScrapedDealData;
    }

    const data = await this.scraperProvider.scrape(normalized);

    await this.prisma.scrapedProduct.upsert({
      where: { productUrl: normalized },
      create: { productUrl: normalized, data: data as unknown as Prisma.InputJsonValue },
      update: { data: data as unknown as Prisma.InputJsonValue, scrapedAt: new Date() },
    });

    return data;
  }
}
