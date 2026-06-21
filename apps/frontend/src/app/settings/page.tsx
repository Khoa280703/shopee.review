'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { uploadImage, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [affiliateId, setAffiliateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    }
  }, [user, loading, router]);

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

  if (loading || !user) {
    return <div className="py-16 text-center text-slate-500">Đang tải...</div>;
  }

  return (
    <div className="mx-auto max-w-xl py-4">
      <h1 className="mb-6 text-2xl font-bold">Cài đặt</h1>
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar src={avatarUrl} name={displayName || user.username} size={64} />
          <label className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Đổi ảnh đại diện
            <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Tên hiển thị</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Giới thiệu</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">🔗 Affiliate ID Shopee</label>
          <input
            value={affiliateId}
            onChange={(e) => setAffiliateId(e.target.value)}
            placeholder="Affiliate ID của bạn"
            className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
          />
          <p className="mt-1 text-xs text-slate-400">Đăng ký tại affiliate.shopee.vn</p>
        </div>

        {message && <p className="text-sm text-green-600">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="h-11 w-full rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </form>
    </div>
  );
}
