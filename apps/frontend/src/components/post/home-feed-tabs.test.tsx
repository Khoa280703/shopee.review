import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { CursorPage, Post } from '@/types';
import { HomeFeedTabs } from './home-feed-tabs';

const mockAuth = vi.hoisted(() => ({ user: null as { id: number; username: string } | null }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: mockAuth.user }) }));

const loadMorePostsCalls = vi.hoisted(() => [] as unknown[]);
vi.mock('./load-more-posts', () => ({
  LoadMorePosts: (props: { source: unknown; emptyState?: ReactNode }) => {
    loadMorePostsCalls.push(props.source);
    return <div data-testid="load-more-posts">{props.emptyState ? 'has-empty-state' : 'no-empty-state'}</div>;
  },
}));

const exploreInitial: CursorPage<Post> = { data: [], nextCursor: null };

describe('HomeFeedTabs', () => {
  beforeEach(() => {
    loadMorePostsCalls.length = 0;
    mockAuth.user = null;
  });

  it('defaults to the For You tab, backed by the SSR-seeded explore source', () => {
    renderWithProviders(<HomeFeedTabs exploreInitial={exploreInitial} />);
    expect(loadMorePostsCalls).toEqual([{ type: 'explore' }]);
  });

  it('prompts login for the Following tab when signed out, without hitting the feed API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomeFeedTabs exploreInitial={exploreInitial} />);

    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/auth/login');
    expect(loadMorePostsCalls).toEqual([{ type: 'explore' }]); // no second (feed) call
  });

  it('fetches the personalized feed with an empty-state fallback when signed in', async () => {
    mockAuth.user = { id: 1, username: 'alice' };
    const user = userEvent.setup();
    renderWithProviders(<HomeFeedTabs exploreInitial={exploreInitial} />);

    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(loadMorePostsCalls).toContainEqual({ type: 'feed' });
    expect(screen.getByTestId('load-more-posts')).toHaveTextContent('has-empty-state');
  });
});
