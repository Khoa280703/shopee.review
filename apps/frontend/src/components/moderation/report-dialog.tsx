'use client';

import { useState } from 'react';
import { moderationApi, type ReportReason, type ReportTargetType } from '@/lib/api';
import { Button } from '@/components/ui/button';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'SCAM', label: 'Lừa đảo' },
  { value: 'OFFENSIVE', label: 'Nội dung phản cảm' },
  { value: 'FAKE', label: 'Thông tin giả' },
  { value: 'OTHER', label: 'Khác' },
];

interface Props {
  targetType: ReportTargetType;
  targetId: number;
  onClose: () => void;
}

export function ReportDialog({ targetType, targetId, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  async function submit() {
    setState('sending');
    try {
      await moderationApi.report(targetType, targetId, reason, detail || undefined);
    } finally {
      setState('done');
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
            <p className="font-headline-md text-headline-md text-on-surface">Đã gửi báo cáo</p>
            <p className="text-body-sm text-on-surface-variant">Cảm ơn bạn đã giúp giữ cộng đồng an toàn.</p>
            <Button fullWidth onClick={onClose}>Đóng</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-headline-md text-headline-md text-on-surface">Báo cáo nội dung</h2>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-body-md text-on-surface">
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Mô tả thêm (tuỳ chọn)"
              className="w-full rounded-lg border border-outline-variant bg-surface-container p-2 text-body-sm text-on-surface"
            />
            <div className="flex gap-2">
              <Button variant="outline" fullWidth onClick={onClose}>Huỷ</Button>
              <Button fullWidth onClick={submit} disabled={state === 'sending'}>
                {state === 'sending' ? 'Đang gửi...' : 'Gửi báo cáo'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
