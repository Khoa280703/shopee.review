import type { ReactionType } from '@app/database';
import type { PrismaService } from '../prisma/prisma.service';

export interface ViewerPostState {
  /** The current viewer's own reaction on this post, or `null` if they have
   * none. Only present (even as `null`) when the viewer is authenticated —
   * omitted entirely for anonymous responses so callers can distinguish
   * "no viewer" from "viewer has no reaction". */
  viewerReaction: ReactionType | null;
  /** Whether the current viewer has bookmarked this post. */
  bookmarked: boolean;
}

/**
 * Batch-attach the viewer's own reaction + bookmark state to a page of posts
 * in two queries total, regardless of page size — the fix for FE audit H5
 * (each `PostFeedCard` used to call `GET /posts/:id/reactions/me` on its own,
 * so a 20-post page fired 20 requests). Posts are never cached with this
 * data baked in: callers run this AFTER any shared Redis cache read so a
 * single cached post list can be reused across different viewers while each
 * still sees their own reaction/bookmark state.
 */
export async function attachViewerPostState<T extends { id: number }>(
  prisma: PrismaService,
  viewerId: number | undefined,
  posts: T[],
): Promise<(T & Partial<ViewerPostState>)[]> {
  if (!viewerId || posts.length === 0) return posts;

  const ids = posts.map((p) => p.id);
  const [reactions, bookmarks] = await Promise.all([
    prisma.reaction.findMany({
      where: { userId: viewerId, postId: { in: ids } },
      select: { postId: true, type: true },
    }),
    prisma.bookmark.findMany({
      where: { userId: viewerId, postId: { in: ids } },
      select: { postId: true },
    }),
  ]);
  const reactionByPost = new Map(reactions.map((r) => [r.postId, r.type]));
  const bookmarkedSet = new Set(bookmarks.map((b) => b.postId));

  return posts.map((p) => ({
    ...p,
    viewerReaction: reactionByPost.get(p.id) ?? null,
    bookmarked: bookmarkedSet.has(p.id),
  }));
}
