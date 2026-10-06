import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ReactionButton } from './reaction-button';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/p/1',
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 1, username: 'viewer' } }),
}));

const socialApi = vi.hoisted(() => ({
  reactionStatus: vi.fn(),
  react: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ socialApi }));

describe('ReactionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trusts the backend-attached viewer state and never fetches its own status (no N+1)', () => {
    renderWithProviders(<ReactionButton postId={1} initialCount={5} initialReaction={null} />);
    expect(socialApi.reactionStatus).not.toHaveBeenCalled();
  });

  it('falls back to fetching its own status when the viewer flag was never attached', () => {
    socialApi.reactionStatus.mockResolvedValue({ type: null, counts: { LIKE: 5 } });
    renderWithProviders(<ReactionButton postId={1} initialCount={5} />);
    expect(socialApi.reactionStatus).toHaveBeenCalledWith(1);
  });

  it('a single tap toggles LIKE and bumps the count optimistically', async () => {
    const user = userEvent.setup();
    let resolveReact: (v: { type: string | null; counts: Record<string, number> }) => void = () => {};
    socialApi.react.mockReturnValue(new Promise((r) => (resolveReact = r)));

    renderWithProviders(<ReactionButton postId={1} initialCount={5} initialReaction={null} />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('5');

    await user.click(button);
    expect(socialApi.react).toHaveBeenCalledWith(1, 'LIKE');
    expect(button).toHaveTextContent('6');
    expect(button).toHaveAttribute('aria-pressed', 'true');

    resolveReact({ type: 'LIKE', counts: { LIKE: 6 } });
    await waitFor(() => expect(button).toHaveTextContent('6'));
  });

  it('tapping an already-active reaction removes it (count goes back down)', async () => {
    const user = userEvent.setup();
    socialApi.react.mockResolvedValue({ type: null, counts: { LIKE: 5 } });

    renderWithProviders(<ReactionButton postId={1} initialCount={6} initialReaction="LIKE" />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('6');

    await user.click(button);
    expect(socialApi.react).toHaveBeenCalledWith(1, 'LIKE');
    expect(button).toHaveTextContent('5');
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
  });
});
