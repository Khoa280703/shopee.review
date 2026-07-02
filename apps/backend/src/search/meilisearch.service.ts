import {
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { Meilisearch, type Index } from 'meilisearch';
import { PrismaService } from '../prisma/prisma.service';

const POSTS_INDEX = 'posts';

export interface PostSearchDoc {
  id: number;
  title: string;
  content: string;
  username: string;
  categoryId: number | null;
  hasProduct: boolean;
  createdAt: number;
  likeCount: number;
  // Diacritic-stripped concatenation so "tim kiem" matches "tìm kiếm".
  _search: string;
}

/**
 * Strips Vietnamese diacritics (Meilisearch has no VN tokenizer). Applied at
 * BOTH index and query time via the `_search` field.
 */
export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  private readonly client: Meilisearch | null;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.MEILI_HOST;
    const apiKey = process.env.MEILI_MASTER_KEY;
    this.client = host ? new Meilisearch({ host, apiKey }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.createIndex(POSTS_INDEX, { primaryKey: 'id' }).catch(() => undefined);
      const index = this.client.index<PostSearchDoc>(POSTS_INDEX);
      await index.updateSettings({
        searchableAttributes: ['_search', 'title', 'content', 'username'],
        filterableAttributes: ['categoryId', 'hasProduct'],
        sortableAttributes: ['createdAt', 'likeCount'],
      });

      // Backfill once if the index is empty.
      const stats = await index.getStats();
      if (stats.numberOfDocuments === 0) {
        await this.reindexAll();
      }
    } catch (error) {
      this.logger.warn(
        `Meilisearch init failed (search will use PG FTS): ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private get index(): Index<PostSearchDoc> {
    return this.client!.index<PostSearchDoc>(POSTS_INDEX);
  }

  private toDoc(post: {
    id: number;
    title: string;
    content: string | null;
    categoryId: number | null;
    productUrl: string | null;
    likeCount: number;
    createdAt: Date;
    user: { username: string };
  }): PostSearchDoc {
    const content = post.content ?? '';
    return {
      id: post.id,
      title: post.title,
      content,
      username: post.user.username,
      categoryId: post.categoryId,
      hasProduct: !!post.productUrl,
      createdAt: post.createdAt.getTime(),
      likeCount: post.likeCount,
      _search: normalizeVi(`${post.title} ${content} ${post.user.username}`),
    };
  }

  async indexPost(postId: number): Promise<void> {
    if (!this.client) return;
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { user: { select: { username: true } } },
    });
    if (!post) return;
    await this.index.addDocuments([this.toDoc(post)]);
  }

  async deletePost(postId: number): Promise<void> {
    if (!this.client) return;
    await this.index.deleteDocument(postId);
  }

  async reindexAll(): Promise<number> {
    if (!this.client) return 0;
    // Cursor-paginated batches keep memory bounded regardless of corpus size
    // (loading the whole table at once OOMs once posts grow large).
    const BATCH = 500;
    let cursor: number | undefined;
    let total = 0;

    for (;;) {
      const posts = await this.prisma.post.findMany({
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        include: { user: { select: { username: true } } },
      });
      if (posts.length === 0) break;

      await this.index.addDocuments(posts.map((p) => this.toDoc(p)));
      total += posts.length;
      cursor = posts[posts.length - 1].id;

      if (posts.length < BATCH) break;
    }

    if (total > 0) {
      this.logger.log(`Reindexed ${total} posts into Meilisearch`);
    }
    return total;
  }

  async searchPosts(
    query: string,
    page: number,
  ): Promise<number[] | null> {
    if (!this.client) return null;
    const res = await this.index.search(normalizeVi(query), {
      limit: 20,
      offset: (page - 1) * 20,
      attributesToRetrieve: ['id'],
    });
    return res.hits.map((h) => h.id);
  }
}
