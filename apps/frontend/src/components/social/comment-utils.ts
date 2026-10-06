import type { Comment } from '@/types';

/**
 * Insert a newly-created top-level comment, deduped by id. Shared by the
 * optimistic REST insert (comments-section.tsx) and the live socket handler
 * (use-comment-socket.ts) — the backend emits `comment:new` over the socket
 * BEFORE the REST call that created it returns, so either one can arrive
 * first; without a shared dedupe check the second arrival duplicated the
 * comment (FE audit M2).
 */
export function upsertTopLevelComment(prev: Comment[], comment: Comment): Comment[] {
  if (prev.some((c) => c.id === comment.id)) return prev;
  return [{ ...comment, replies: comment.replies ?? [] }, ...prev];
}

/** Same dedupe for a reply, attached under its loaded parent if present. */
export function upsertReply(prev: Comment[], parentId: number, reply: Comment): Comment[] {
  return prev.map((c) => {
    if (c.id !== parentId) return c;
    const replies = c.replies ?? [];
    if (replies.some((r) => r.id === reply.id)) return c;
    return {
      ...c,
      replies: [...replies, reply],
      replyCount: (c.replyCount ?? replies.length) + 1,
    };
  });
}

/**
 * Apply a comment deletion to local state (shared by the optimistic REST
 * delete and the live `comment:deleted` socket event). Mirrors the backend's
 * placeholder rule (M2, `getComments` in social.service.ts): a top-level
 * comment with remaining live replies is kept as a placeholder (`isDeleted`,
 * blanked content) instead of being removed outright — removing it would
 * orphan its still-visible replies from the list. A reply, or a top-level
 * comment with no replies left, is simply dropped.
 */
export function applyCommentDeletion(prev: Comment[], commentId: number): Comment[] {
  const result: Comment[] = [];
  for (const c of prev) {
    if (c.id === commentId) {
      if ((c.replies?.length ?? 0) > 0) {
        result.push({ ...c, isDeleted: true, content: '' });
      }
      continue;
    }
    const replies = c.replies?.filter((r) => r.id !== commentId);
    result.push(replies && replies.length !== c.replies?.length ? { ...c, replies } : c);
  }
  return result;
}
