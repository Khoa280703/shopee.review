'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { ReportDialog } from './report-dialog';
import type { ReportTargetType } from '@/lib/api';

interface Props {
  targetType: ReportTargetType;
  targetId: number;
  label?: string;
  className?: string;
}

/** Small "Báo cáo" trigger that opens the report dialog. Hidden for guests. */
export function ReportButton({ targetType, targetId, label, className }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-xs text-body-sm text-on-surface-variant transition-colors hover:text-error',
          className,
        )}
      >
        <Icon name="flag" className="text-lg" />
        {label && <span>{label}</span>}
      </button>
      {open && <ReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  );
}
