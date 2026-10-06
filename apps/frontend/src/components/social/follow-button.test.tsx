import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { FollowButton } from './follow-button';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/@alice',
}));

const mockAuth = vi.hoisted(() => ({ user: { id: 1, username: 'viewer' } as { id: number; username: string } | null }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: mockAuth.user }),
}));

const socialApi = vi.hoisted(() => ({
  followStatus: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ socialApi }));

describe('FollowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: 1, username: 'viewer' };
  });

  it('renders the server-provided following state without an extra fetch', () => {
    renderWithProviders(<FollowButton username="alice" initialFollowing={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(socialApi.followStatus).not.toHaveBeenCalled();
  });

  it('toggles to following optimistically before the request resolves', async () => {
    const user = userEvent.setup();
    let resolveFollow: (v: { following: boolean }) => void = () => {};
    socialApi.follow.mockReturnValue(new Promise((r) => (resolveFollow = r)));

    renderWithProviders(<FollowButton username="alice" initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    // Optimistic update lands synchronously with the click, before the
    // mocked network call ever resolves.
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(socialApi.follow).toHaveBeenCalledWith('alice');

    resolveFollow({ following: true });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });

  it('rolls back the optimistic state when the request fails', async () => {
    const user = userEvent.setup();
    let rejectFollow: (e: unknown) => void = () => {};
    socialApi.follow.mockReturnValue(new Promise((_r, rej) => (rejectFollow = rej)));

    renderWithProviders(<FollowButton username="alice" initialFollowing={false} />);
    const button = screen.getByRole('button');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    rejectFollow(new Error('network error'));
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
  });

  it('redirects to login instead of calling the API when logged out', async () => {
    mockAuth.user = null;
    const user = userEvent.setup();
    renderWithProviders(<FollowButton username="alice" initialFollowing={false} />);

    await user.click(screen.getByRole('button'));
    expect(socialApi.follow).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/auth/login?next=%2F%40alice');
  });

  it('never renders on the viewer\'s own profile', () => {
    mockAuth.user = { id: 1, username: 'alice' };
    const { container } = renderWithProviders(
      <FollowButton username="alice" initialFollowing={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
