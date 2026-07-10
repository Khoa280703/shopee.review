'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { buttonClasses } from '@/components/ui/button-classes';
import { authApi, moderationApi, uploadImage, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AuthSession } from '@/types';

export default function SettingsPage() {
  const { user, loading, refresh, setUser } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [affiliateId, setAffiliateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [blocked, setBlocked] = useState<{ username: string; displayName: string }[]>([]);
  const [sessions, setSessions] = useState<AuthSession[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
      return;
    }
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
      setAffiliateId(user.affiliateId ?? '');
      moderationApi.listBlocked().then(setBlocked).catch(() => undefined);
      authApi.sessions().then(setSessions).catch(() => undefined);
    }
  }, [user, loading, router]);

  async function unblock(username: string) {
    await moderationApi.unblock(username);
    setBlocked((prev) => prev.filter((b) => b.username !== username));
  }

  async function revokeSession(id: string) {
    await authApi.revokeSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function revokeOtherSessions() {
    await authApi.revokeOtherSessions();
    setSessions((prev) => prev.filter((s) => s.current));
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await uploadImage(file);
    setAvatarUrl(url);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await usersApi.updateMe({ displayName, bio, avatarUrl: avatarUrl || undefined, affiliateId });
      await refresh();
      setMessage('Đã lưu thay đổi.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangingPw(true);
    setPwMessage(null);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPwMessage('Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
    } catch (err) {
      setPwMessage(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setChangingPw(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await usersApi.deleteAccount();
      setUser(null);
      router.replace('/');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Xóa tài khoản thất bại');
      setDeleting(false);
    }
  }

  if (loading || !user) {
    return <div className="py-16 text-center text-on-surface-variant">Đang tải...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-lg">
      <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">Cài đặt</h1>
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar src={avatarUrl} name={displayName || user.username} size={64} />
          <label className={buttonClasses({ variant: 'outline', size: 'sm', className: 'cursor-pointer' })}>
            Đổi ảnh đại diện
            <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
          </label>
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">Tên hiển thị</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">Giới thiệu</label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} />
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">Affiliate ID Shopee</label>
          <Input
            value={affiliateId}
            onChange={(e) => setAffiliateId(e.target.value)}
            placeholder="Affiliate ID của bạn"
          />
          <p className="mt-1 text-label-caps text-on-surface-variant">Đăng ký tại affiliate.shopee.vn</p>
        </div>

        {message && <p className="text-body-sm text-tertiary">{message}</p>}

        <Button type="submit" fullWidth size="lg" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </form>

      <form onSubmit={changePassword} className="mt-10 space-y-4 rounded-xl border border-outline-variant p-4">
        <h2 className="font-title-md text-title-md font-semibold text-on-surface">Đổi mật khẩu</h2>
        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">Mật khẩu hiện tại</label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">Mật khẩu mới</label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        {pwMessage && <p className="text-body-sm text-tertiary">{pwMessage}</p>}
        <Button type="submit" size="lg" disabled={changingPw || !currentPassword || newPassword.length < 8}>
          {changingPw ? 'Đang đổi...' : 'Đổi mật khẩu'}
        </Button>
      </form>

      <div className="mt-10 rounded-xl border border-outline-variant p-4">
        <h2 className="font-title-md text-title-md font-semibold text-on-surface">Người dùng đã chặn</h2>
        {blocked.length === 0 ? (
          <p className="mt-2 text-body-sm text-on-surface-variant">Bạn chưa chặn ai.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {blocked.map((b) => (
              <li key={b.username} className="flex items-center justify-between">
                <span className="text-body-md text-on-surface">
                  {b.displayName} <span className="text-on-surface-variant">@{b.username}</span>
                </span>
                <button
                  onClick={() => void unblock(b.username)}
                  className="rounded-full border border-outline-variant px-3 py-1 text-body-sm text-on-surface hover:bg-surface-container"
                >
                  Bỏ chặn
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 rounded-xl border border-outline-variant p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-title-md text-title-md font-semibold text-on-surface">Phiên đăng nhập</h2>
          {sessions.filter((s) => !s.current).length > 0 && (
            <button
              onClick={() => void revokeOtherSessions()}
              className="rounded-full border border-outline-variant px-3 py-1 text-body-sm text-on-surface hover:bg-surface-container"
            >
              Đăng xuất thiết bị khác
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="mt-2 text-body-sm text-on-surface-variant">Không có phiên nào.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-body-sm text-on-surface">
                  <span className="block truncate">{s.userAgent ?? 'Thiết bị không rõ'}</span>
                  <span className="text-on-surface-variant">
                    {s.ip ?? 'IP ẩn'} · {new Date(s.createdAt).toLocaleString('vi-VN')}
                    {s.current && ' · thiết bị này'}
                  </span>
                </span>
                {!s.current && (
                  <button
                    onClick={() => void revokeSession(s.id)}
                    className="shrink-0 rounded-full border border-outline-variant px-3 py-1 text-body-sm text-on-surface hover:bg-surface-container"
                  >
                    Đăng xuất
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 rounded-xl border border-error/40 bg-error/5 p-4">
        <h2 className="font-title-md text-title-md font-semibold text-error">Vùng nguy hiểm</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Xóa tài khoản sẽ gỡ bỏ vĩnh viễn toàn bộ bài viết, bình luận, lượt thích và người theo dõi của bạn. Hành động này không thể hoàn tác.
        </p>

        {confirmDelete ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              size="md"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deleting}
              className="rounded-lg bg-error px-4 py-2 text-body-md font-semibold text-on-error disabled:opacity-60"
            >
              {deleting ? 'Đang xóa...' : 'Tôi chắc chắn, xóa tài khoản'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 rounded-lg border border-error px-4 py-2 text-body-md font-semibold text-error"
          >
            Xóa tài khoản
          </button>
        )}
      </div>
    </div>
  );
}
