import { Skeleton } from "@/components/ui/skeleton";

export function GridSkeleton({
  count = 6,
  heightClass = "h-40",
}: {
  count?: number;
  heightClass?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={`${heightClass} rounded-2xl bg-card/40`}
        />
      ))}
    </div>
  );
}