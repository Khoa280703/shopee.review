import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Comment } from '@/types';
import { CommentsSection } from './comments-section';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/p/1',
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 1, username: 'viewer' } }),
}));

// Socket.io is a live-update side channel, not under test here — comments
// arrive over REST in every scenario below.
vi.mock('./use-comment-socket', () => ({ useCommentSocket: vi.fn() }));

const socialApi = vi.hoisted(() => ({
  comments: vi.fn(),
  replies: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ socialApi }));

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    userId: 2,
    postId: 1,
    content: 'hello world',
    createdAt: new Date().toISOString(),
    user: { username: 'bob', displayName: 'Bob' },
    replies: [],
    ...overrides,
  };
}

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state, then the fetched comments', async () => {
    socialApi.comments.mockResolvedValue({ data: [makeComment()], nextCursor: null });
    renderWithProviders(<CommentsSection postId={1} />);

    expect(screen.getByText(/Đang tải|loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('hello world')).toBeInTheDocument());
  });

  it('shows the empty state once loaded with zero comments', async () => {
    socialApi.comments.mockResolvedValue({ data: [], nextCursor: null });
    renderWithProviders(<CommentsSection postId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Chưa có bình luận nào. Hãy là người đầu tiên!')).toBeInTheDocument(),
    );
  });

  it('submits on Enter, but not while an IME composition is still in progress', async () => {
    const user = userEvent.setup();
    socialApi.comments.mockResolvedValue({ data: [], nextCursor: null });
    socialApi.addComment.mockResolvedValue(makeComment({ id: 99, content: 'typed text' }));
    renderWithProviders(<CommentsSection postId={1} />);
    await waitFor(() => expect(socialApi.comments).toHaveBeenCalled());

    const [input] = screen.getAllByRole('textbox');
    await user.type(input, 'typed text');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(socialApi.addComment).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false });
    await waitFor(() => expect(socialApi.addComment).toHaveBeenCalledWith(1, 'typed text'));
  });

  it('adds exactly one entry for a successful post and clears the input', async () => {
    const user = userEvent.setup();
    socialApi.comments.mockResolvedValue({ data: [], nextCursor: null });
    socialApi.addComment.mockResolvedValue(makeComment({ id: 42, content: 'new comment' }));
    renderWithProviders(<CommentsSection postId={1} />);
    await waitFor(() => expect(socialApi.comments).toHaveBeenCalled());

    const [input] = screen.getAllByRole('textbox');
    await user.type(input, 'new comment');
    await user.click(screen.getAllByRole('button', { name: /gửi|send/i })[0]);

    await waitFor(() => expect(screen.getAllByText('new comment')).toHaveLength(1));
    expect(input).toHaveValue('');
  });

  it('keeps the typed text and shows an error when the post fails', async () => {
    const user = userEvent.setup();
    socialApi.comments.mockResolvedValue({ data: [], nextCursor: null });
    socialApi.addComment.mockRejectedValue(new Error('boom'));
    renderWithProviders(<CommentsSection postId={1} />);
    await waitFor(() => expect(socialApi.comments).toHaveBeenCalled());

    const [input] = screen.getAllByRole('textbox');
    await user.type(input, 'will fail');
    await user.click(screen.getAllByRole('button', { name: /gửi|send/i })[0]);

    await waitFor(() => expect(socialApi.addComment).toHaveBeenCalled());
    expect(input).toHaveValue('will fail');
  });

  it('renders a soft-deleted top-level comment as a placeholder, not its old content', async () => {
    socialApi.comments.mockResolvedValue({
      data: [
        makeComment({
          id: 5,
          content: '',
          isDeleted: true,
          replies: [makeComment({ id: 6, userId: 3, content: 'still visible reply' })],
          replyCount: 1,
        }),
      ],
      nextCursor: null,
    });
    renderWithProviders(<CommentsSection postId={1} />);

    await waitFor(() => expect(screen.getByText('still visible reply')).toBeInTheDocument());
    expect(screen.getByText('Bình luận đã bị xoá.')).toBeInTheDocument();
    // Delete/Reply actions are hidden on a deleted comment (nothing left to act on).
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trả lời' })).not.toBeInTheDocument();
  });
});
