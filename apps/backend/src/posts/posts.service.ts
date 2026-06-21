import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import {
  normalizeShopeeUrl,
  SCRAPER_PROVIDER,
  type ScraperProvider,
} from '../scraper/scraper-provider.interface';
import type { ScrapedDealData } from '../scraper/types/scraped-deal-data';
import { CreatePostDto } from './dto/create-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const POST_INCLUDE = {
  user: { select: { username: true, displayName: true, avatarUrl: true } },
  category: true,
} satisfies Prisma.PostInclude;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCRAPER_PROVIDER) private readonly scraperProvider: ScraperProvider,
  ) {}

  async findAll(dto: QueryPostsDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.PostWhereInput = {};
    if (dto.categoryId) where.categoryId = dto.categoryId;
    if (dto.search) {
      where.OR = [
        { title: { contains: dto.search, mode: 'insensitive' } },
        { content: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    const sortBy = dto.sortBy ?? 'createdAt';
    const orderBy: Prisma.PostOrderByWithRelationInput =
      sortBy === 'createdAt' ? { id: 'desc' } : { [sortBy]: 'desc' };

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

  async getTrending(limit = 20) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await this.prisma.post.findMany({
      where: { createdAt: { gte: since } },
      include: POST_INCLUDE,
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    return posts
      .map((p) => ({
        post: p,
        score: p.clickCount * 0.4 + p.likeCount * 0.3 + p.commentCount * 0.3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.post);
  }

  async create(user: AuthUser, dto: CreatePostDto) {
    if (!user.emailVerified) {
      throw new ForbiddenException('Vui lòng xác minh email trước khi đăng bài');
    }
    return this.prisma.post.create({
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
  }

  async update(userId: number, postId: number, dto: UpdatePostDto) {
    await this.assertOwner(userId, postId);
    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...dto,
        productMeta: dto.productMeta as Prisma.InputJsonValue | undefined,
      },
      include: POST_INCLUDE,
    });
  }

  async remove(userId: number, postId: number) {
    await this.assertOwner(userId, postId);
    await this.prisma.post.delete({ where: { id: postId } });
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
