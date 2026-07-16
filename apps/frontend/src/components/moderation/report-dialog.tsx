'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { moderationApi, type ReportReason, type ReportTargetType } from '@/lib/api';
import { Button } from '@/components/ui/button';

const REASONS: ReportReason[] = ['SPAM', 'SCAM', 'OFFENSIVE', 'FAKE', 'OTHER'];

interface Props {
  targetType: ReportTargetType;
  targetId: number;
  onClose: () => void;
}

export function ReportDialog({ targetType, targetId, onClose }: Props) {
  const t = useTranslations('moderation');
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit() {
    setState('sending');
    try {
      await moderationApi.report(targetType, targetId, reason, detail || undefined);
      setState('done');
    } catch {
      // Never show success on failure — the report would be silently lost.
      setState('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-surface p-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {state === 'done' ? (
          <div className="space-y-4 text-center">
            <p className="font-headline-md text-headline-md text-on-surface">{t('report.done.title')}</p>
            <p className="text-body-sm text-on-surface-variant">{t('report.done.message')}</p>
            <Button fullWidth onClick={onClose}>{t('report.close')}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-headline-md text-headline-md text-on-surface">{t('report.title')}</h2>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-body-md text-on-surface">
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {t(`reasons.${r}`)}
                </label>
              ))}
            </div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('report.detailPlaceholder')}
              className="w-full rounded-lg border border-outline-variant bg-surface-container p-2 text-body-sm text-on-surface"
            />
            {state === 'error' && (
              <p className="text-body-sm text-error">
                {t('report.error')}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" fullWidth onClick={onClose}>{t('report.cancel')}</Button>
              <Button fullWidth onClick={submit} disabled={state === 'sending'}>
                {state === 'sending' ? t('report.sending') : state === 'error' ? t('report.retry') : t('report.submit')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
