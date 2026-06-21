import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold text-orange-500">404</h1>
      <p className="text-slate-500">Không tìm thấy trang bạn yêu cầu.</p>
      <Link href="/" className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600">
        Về trang chủ
      </Link>
    </div>
  );
}
