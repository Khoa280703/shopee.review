import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { BookmarkButton } from './bookmark-button';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/p/1',
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 1, username: 'viewer' } }),
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => toast,
}));

const socialApi = vi.hoisted(() => ({
  bookmarkStatus: vi.fn(),
  setBookmark: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ socialApi }));

describe('BookmarkButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the idempotent desired end-state, not a toggle flag read from stale cache', async () => {
    const user = userEvent.setup();
    socialApi.setBookmark.mockResolvedValue({ bookmarked: true });

    renderWithProviders(<BookmarkButton postId={7} initialBookmarked={false} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    // PUT /bookmark called with the explicit target state (true), not a bare toggle.
    expect(socialApi.setBookmark).toHaveBeenCalledWith(7, true);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });

  it('two rapid clicks each state their own desired end-state (set then unset)', async () => {
    const user = userEvent.setup();
    socialApi.setBookmark.mockResolvedValue({ bookmarked: true });

    renderWithProviders(<BookmarkButton postId={7} initialBookmarked={false} />);
    const button = screen.getByRole('button');

    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    socialApi.setBookmark.mockResolvedValue({ bookmarked: false });
    await user.click(button);

    expect(socialApi.setBookmark).toHaveBeenNthCalledWith(1, 7, true);
    expect(socialApi.setBookmark).toHaveBeenNthCalledWith(2, 7, false);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
  });

  it('rolls back and shows an error toast when the request fails', async () => {
    const user = userEvent.setup();
    socialApi.setBookmark.mockRejectedValue(new Error('boom'));

    renderWithProviders(<BookmarkButton postId={7} initialBookmarked={false} />);
    const button = screen.getByRole('button');

    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});
