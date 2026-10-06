import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { CursorPage, Post } from '@/types';
import { LoadMorePosts } from './load-more-posts';

// Stubs stand in for the real cards so these tests assert LoadMorePosts's own
// loading/error/empty decisions (FE audit H3), not PostCard rendering.
vi.mock('./post-grid', () => ({
  PostFeed: ({ posts }: { posts: Post[] }) => <div data-testid="feed">{posts.length} posts</div>,
  PostGrid: ({ posts }: { posts: Post[] }) => <div data-testid="grid">{posts.length} posts</div>,
  PostFeedSkeleton: () => <div data-testid="feed-skeleton">loading-skeleton</div>,
  PostGridSkeleton: () => <div data-testid="grid-skeleton">loading-skeleton</div>,
}));

const feedApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  feedApi,
  postsApi: { explore: vi.fn(), list: vi.fn() },
  usersApi: { posts: vi.fn() },
}));

const emptyPage: CursorPage<Post> = { data: [], nextCursor: null };

describe('LoadMorePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the skeleton while the first page is loading (no SSR seed)', async () => {
    feedApi.get.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<LoadMorePosts source={{ type: 'feed' }} variant="feed" />);
    expect(screen.getByTestId('feed-skeleton')).toBeInTheDocument();
  });

  it('shows an error with a retry button instead of a hard-coded empty state on failure', async () => {
    feedApi.get.mockRejectedValue(new Error('network down'));
    renderWithProviders(<LoadMorePosts source={{ type: 'feed' }} variant="feed" />);

    await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /thử lại|retry/i });

    feedApi.get.mockResolvedValue(emptyPage);
    await userEvent.setup().click(retry);
    await waitFor(() => expect(screen.getByTestId('feed')).toBeInTheDocument());
  });

  it('renders the caller emptyState only once loading is done and the result is truly empty', async () => {
    feedApi.get.mockResolvedValue(emptyPage);
    renderWithProviders(
      <LoadMorePosts
        source={{ type: 'feed' }}
        variant="feed"
        emptyState={<div data-testid="custom-empty">nothing here</div>}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('custom-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
  });

  it('renders the fetched posts once loaded', async () => {
    feedApi.get.mockResolvedValue({
      data: [{ id: 1 } as Post, { id: 2 } as Post],
      nextCursor: null,
    });
    renderWithProviders(<LoadMorePosts source={{ type: 'feed' }} variant="feed" />);
    await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('2 posts'));
  });
});
