import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useSocket } from '@/components/providers/socket-provider';
import { acquireSocket, releaseSocket } from '@/lib/socket';
import type { Comment } from '@/types';
import { applyCommentDeletion, upsertReply, upsertTopLevelComment } from './comment-utils';

/**
 * Live comment stream for a post via Socket.io. Joins the `post:{postId}` room
 * and applies incoming events to local state, deduping by comment id so an
 * optimistic local insert isn't duplicated when the broadcast echoes back.
 * Optionally forwards live like-count updates.
 *
 * `acquireSocket`/`releaseSocket` open/close the actual network connection —
 * this is the only place in the app that needs Socket.io, so the connection
 * now only exists while a post detail page with this hook mounted is open,
 * not for every anonymous visitor on every page (FE audit P1).
 */
export function useCommentSocket(
  postId: number,
  setComments: Dispatch<SetStateAction<Comment[]>>,
  onReactionUpdate?: (total: number) => void,
) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    acquireSocket();

    const join = () => socket.emit('join-post', postId);
    join();
    socket.on('connect', join);

    const onNew = (comment: Comment) => {
      setComments((prev) =>
        comment.parentId == null
          ? upsertTopLevelComment(prev, comment)
          : upsertReply(prev, comment.parentId, comment),
      );
    };

    const onDeleted = ({ commentId }: { commentId: number }) => {
      setComments((prev) => applyCommentDeletion(prev, commentId));
    };

    const onReaction = ({ total }: { postId: number; total: number }) => {
      onReactionUpdate?.(total);
    };

    socket.on('comment:new', onNew);
    socket.on('comment:deleted', onDeleted);
    socket.on('reaction:update', onReaction);

    return () => {
      socket.emit('leave-post', postId);
      socket.off('connect', join);
      socket.off('comment:new', onNew);
      socket.off('comment:deleted', onDeleted);
      socket.off('reaction:update', onReaction);
      releaseSocket();
    };
  }, [socket, postId, setComments, onReactionUpdate]);
}
