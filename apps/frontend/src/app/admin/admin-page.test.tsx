import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { AdminReport } from '@/lib/api';
import AdminPage from './page';

const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const mockAuth = vi.hoisted(() => ({
  user: { id: 1, username: 'root', isAdmin: true } as { id: number; username: string; isAdmin: boolean } | null,
  loading: false,
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/providers/toast-provider', () => ({ useToast: () => toast }));

const adminApi = vi.hoisted(() => ({
  listReports: vi.fn(),
  resolveReport: vi.fn(),
  deletePost: vi.fn(),
  restorePost: vi.fn(),
  deleteComment: vi.fn(),
  restoreComment: vi.fn(),
  listDeletedPosts: vi.fn(),
  listDeletedComments: vi.fn(),
  suspendUser: vi.fn(),
  unsuspendUser: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  listLockedUsers: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ adminApi }));

const postReport: AdminReport = {
  id: 10,
  targetType: 'POST',
  targetId: 99,
  reason: 'SPAM',
  detail: null,
  status: 'PENDING',
  createdAt: new Date().toISOString(),
  reporter: { username: 'bob', displayName: 'Bob' },
};

const userReport: AdminReport = {
  id: 11,
  targetType: 'USER',
  targetId: 42,
  reason: 'SCAM',
  detail: 'spam DMs',
  status: 'PENDING',
  createdAt: new Date().toISOString(),
  reporter: { username: 'carol', displayName: 'Carol' },
};

describe('AdminPage confirm dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: 1, username: 'root', isAdmin: true };
    mockAuth.loading = false;
    adminApi.listReports.mockResolvedValue([postReport, userReport]);
    vi.spyOn(window, 'confirm');
  });

  it('redirects away a non-admin instead of rendering the panel', () => {
    mockAuth.user = { id: 1, username: 'root', isAdmin: false };
    renderWithProviders(<AdminPage />);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('does NOT delete the post when the confirm dialog is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);
    await waitFor(() => expect(screen.getByText('Xoá bài')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Xoá bài' }));
    expect(window.confirm).toHaveBeenCalledWith('Xoá bài viết này?');
    expect(adminApi.deletePost).not.toHaveBeenCalled();
  });

  it('deletes the post and reloads the list once the dialog is confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    adminApi.deletePost.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);
    await waitFor(() => expect(screen.getByText('Xoá bài')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Xoá bài' }));
    await waitFor(() => expect(adminApi.deletePost).toHaveBeenCalledWith(99, undefined));
    // Reload after the action, as the panel does on every successful act().
    expect(adminApi.listReports).toHaveBeenCalledTimes(2);
  });

  it('gates the irreversible-feeling ban action behind its own confirm message', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    adminApi.banUser.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);
    await waitFor(() => expect(screen.getByText('Khoá tài khoản')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Khoá tài khoản' }));
    expect(window.confirm).toHaveBeenCalledWith(
      'Khoá tài khoản này? Họ sẽ bị đăng xuất và mọi bài viết/bình luận sẽ bị ẩn ở mọi nơi.',
    );
    await waitFor(() => expect(adminApi.banUser).toHaveBeenCalledWith(42));
  });

  it('resolving a report needs no confirmation', async () => {
    adminApi.resolveReport.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);
    await waitFor(() => expect(screen.getAllByText('Đã xử lý').length).toBeGreaterThan(0));

    await user.click(screen.getAllByRole('button', { name: 'Đã xử lý' })[0]);
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(adminApi.resolveReport).toHaveBeenCalledWith(10, 'RESOLVED'));
  });
});
