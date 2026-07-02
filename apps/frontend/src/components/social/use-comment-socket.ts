import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useSocket } from '@/components/providers/socket-provider';
import type { Comment } from '@/types';

/**
 * Live comment stream for a post via Socket.io. Joins the `post:{postId}` room
 * and applies incoming events to local state, deduping by comment id so an
 * optimistic local insert isn't duplicated when the broadcast echoes back.
 * Optionally forwards live like-count updates.
 */
export function useCommentSocket(
  postId: number,
  setComments: Dispatch<SetStateAction<Comment[]>>,
  onLikeUpdate?: (likeCount: number) => void,
) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const join = () => socket.emit('join-post', postId);
    join();
    socket.on('connect', join);

    const onNew = (comment: Comment) => {
      setComments((prev) => {
        if (comment.parentId == null) {
          if (prev.some((c) => c.id === comment.id)) return prev;
          return [{ ...comment, replies: [] }, ...prev];
        }
        // Reply: attach to its parent if loaded; dedup by id.
        return prev.map((c) => {
          if (c.id !== comment.parentId) return c;
          const replies = c.replies ?? [];
          if (replies.some((r) => r.id === comment.id)) return c;
          return {
            ...c,
            replies: [...replies, comment],
            replyCount: (c.replyCount ?? replies.length) + 1,
          };
        });
      });
    };

    const onDeleted = ({ commentId }: { commentId: number }) => {
      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => ({
            ...c,
            replies: c.replies?.filter((r) => r.id !== commentId),
          })),
      );
    };

    const onLike = ({ likeCount }: { postId: number; likeCount: number }) => {
      onLikeUpdate?.(likeCount);
    };

    socket.on('comment:new', onNew);
    socket.on('comment:deleted', onDeleted);
    socket.on('like:update', onLike);

    return () => {
      socket.emit('leave-post', postId);
      socket.off('connect', join);
      socket.off('comment:new', onNew);
      socket.off('comment:deleted', onDeleted);
      socket.off('like:update', onLike);
    };
  }, [socket, postId, setComments, onLikeUpdate]);
}
