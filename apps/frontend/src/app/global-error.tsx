'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Đã có lỗi xảy ra</h1>
          <p>Vui lòng tải lại trang.</p>
        </div>
      </body>
    </html>
  );
}
