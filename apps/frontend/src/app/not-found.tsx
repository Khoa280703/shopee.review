import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button-classes';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-display-lg font-bold text-primary">404</h1>
      <p className="text-on-surface-variant">Không tìm thấy trang bạn yêu cầu.</p>
      <Link href="/" className={buttonClasses({ size: 'lg' })}>
        Về trang chủ
      </Link>
    </div>
  );
}
