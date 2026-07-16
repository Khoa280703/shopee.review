'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { buttonClasses } from '@/components/ui/button-classes';
import { authApi, moderationApi, uploadImage, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { cn } from '@/lib/cn';
import type { AuthSession } from '@/types';

type SettingsTab = 'profile' | 'appearance' | 'security' | 'privacy' | 'account';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const common = useTranslations('common');
  const locale = useLocale();
  const { user, loading, refresh, setUser } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>('profile');
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
      setMessage(t('saveSuccess'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('saveFailed'));
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
      setPwMessage(t('passwordChanged'));
    } catch (err) {
      setPwMessage(err instanceof Error ? err.message : t('passwordChangeFailed'));
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
      setMessage(err instanceof Error ? err.message : t('deleteAccountFailed'));
      setDeleting(false);
    }
  }

  if (loading || !user) {
    return <div className="py-16 text-center text-on-surface-variant">{common('loading')}</div>;
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: t('tabProfile') },
    { id: 'appearance', label: t('appearance') },
    { id: 'security', label: t('tabSecurity') },
    { id: 'privacy', label: t('tabPrivacy') },
    { id: 'account', label: t('tabAccount') },
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-lg">
      <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">{t('title')}</h1>

      {/* Tab bar (scrolls horizontally on mobile) */}
      <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto border-b border-outline-variant">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-body-sm font-semibold transition-colors',
              tab === tb.id
                ? 'border-primary text-on-surface'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'appearance' && <AppearanceSettings />}

      {tab === 'profile' && (
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar src={avatarUrl} name={displayName || user.username} size={64} />
          <label className={buttonClasses({ variant: 'outline', size: 'sm', className: 'cursor-pointer' })}>
            {t('changeAvatar')}
            <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
          </label>
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">{t('displayName')}</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">{t('bio')}</label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} />
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">{t('affiliateId')}</label>
          <Input
            value={affiliateId}
            onChange={(e) => setAffiliateId(e.target.value)}
            placeholder={t('affiliateIdPlaceholder')}
          />
          <p className="mt-1 text-label-caps text-on-surface-variant">{t('affiliateRegisterHint')}</p>
        </div>

        {message && <p className="text-body-sm text-tertiary">{message}</p>}

        <Button type="submit" fullWidth size="lg" disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
      </form>
      )}

      {tab === 'security' && (
      <form onSubmit={changePassword} className="space-y-4 rounded-xl border border-outline-variant p-4">
        <h2 className="font-title-md text-title-md font-semibold text-on-surface">{t('changePassword')}</h2>
        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">{t('currentPassword')}</label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="mb-1 block text-body-sm font-medium text-on-surface">{t('newPassword')}</label>
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
          {changingPw ? t('changingPassword') : t('changePassword')}
        </Button>
      </form>
      )}

      {tab === 'privacy' && (
      <div className="rounded-xl border border-outline-variant p-4">
        <h2 className="font-title-md text-title-md font-semibold text-on-surface">{t('blockedUsers')}</h2>
        {blocked.length === 0 ? (
          <p className="mt-2 text-body-sm text-on-surface-variant">{t('noBlockedUsers')}</p>
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
                  {t('unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {tab === 'security' && (
      <div className="mt-4 rounded-xl border border-outline-variant p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-title-md text-title-md font-semibold text-on-surface">{t('sessions')}</h2>
          {sessions.filter((s) => !s.current).length > 0 && (
            <button
              onClick={() => void revokeOtherSessions()}
              className="rounded-full border border-outline-variant px-3 py-1 text-body-sm text-on-surface hover:bg-surface-container"
            >
              {t('logoutOtherDevices')}
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="mt-2 text-body-sm text-on-surface-variant">{t('noSessions')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-body-sm text-on-surface">
                  <span className="block truncate">{s.userAgent ?? t('unknownDevice')}</span>
                  <span className="text-on-surface-variant">
                    {s.ip ?? t('hiddenIp')} · {new Date(s.createdAt).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                    {s.current && ` · ${t('thisDevice')}`}
                  </span>
                </span>
                {!s.current && (
                  <button
                    onClick={() => void revokeSession(s.id)}
                    className="shrink-0 rounded-full border border-outline-variant px-3 py-1 text-body-sm text-on-surface hover:bg-surface-container"
                  >
                    {t('logoutSession')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {tab === 'account' && (
      <div className="rounded-xl border border-error/40 bg-error/5 p-4">
        <h2 className="font-title-md text-title-md font-semibold text-error">{t('dangerZone')}</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {t('deleteAccountWarning')}
        </p>

        {confirmDelete ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              size="md"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              {common('cancel')}
            </Button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deleting}
              className="rounded-lg bg-error px-4 py-2 text-body-md font-semibold text-on-error disabled:opacity-60"
            >
              {deleting ? t('deletingAccount') : t('confirmDeleteAccount')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 rounded-lg border border-error px-4 py-2 text-body-md font-semibold text-error"
          >
            {t('deleteAccount')}
          </button>
        )}
      </div>
      )}
    </div>
  );
}
