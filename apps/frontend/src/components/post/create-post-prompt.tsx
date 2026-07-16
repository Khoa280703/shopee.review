'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { buttonClasses } from '@/components/ui/button-classes';
import { useAuth } from '@/lib/auth-context';

export function CreatePostPrompt() {
  const t = useTranslations('create');
  const { user } = useAuth();
  const router = useRouter();

  function go() {
    router.push(user ? '/create' : '/auth/login');
  }

  return (
    <div className="mb-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
      <div className="flex gap-md">
        <Avatar src={user?.avatarUrl} name={user?.displayName ?? ''} size={40} />
        <button
          onClick={go}
          className="flex-1 rounded-full bg-surface-container px-4 text-left font-body-md text-body-md text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          {t('promptPlaceholder')}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-outline-variant pt-3">
        <div className="flex gap-1 text-primary">
          <IconButton icon="image" label={t('addImage')} onClick={go} className="hover:bg-surface-container-low" />
          <IconButton icon="link" label={t('addLink')} onClick={go} className="hover:bg-surface-container-low" />
          <IconButton icon="sell" label={t('addProduct')} onClick={go} className="hover:bg-surface-container-low" />
        </div>
        <button onClick={go} className={buttonClasses({ size: 'sm' })}>
          {t('publish')}
        </button>
      </div>
    </div>
  );
}
