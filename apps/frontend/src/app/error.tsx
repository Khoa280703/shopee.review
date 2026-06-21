'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold text-red-600">Đã có lỗi xảy ra</h1>
      <p className="text-slate-500">Vui lòng thử lại sau.</p>
      <button
        onClick={reset}
        className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Thử lại
      </button>
    </div>
  );
}
