import { Skeleton } from '@/components/ui/skeleton';

// Skeleton for the dynamic (SSR) category feed so client navigation into a
// category doesn't sit on a blank screen while the server renders. Scoped to
// this route only — a root-level loading.tsx would turn notFound() on sibling
// routes (e.g. an invalid post id) into a soft 404 (HTTP 200).
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-container-max flex-col gap-lg px-0 py-lg sm:px-4 lg:px-lg">
      <div className="flex w-full flex-1 flex-col gap-lg lg:max-w-[700px]">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-surface-container-high bg-surface p-md shadow-sm">
            <div className="flex items-center gap-md">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
