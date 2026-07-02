'use client';

import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-headline-md font-bold text-error">Đã có lỗi xảy ra</h1>
      <p className="text-on-surface-variant">Vui lòng thử lại sau.</p>
      <Button size="lg" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
