export default function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-4 rounded-2xl border border-border bg-surface p-6">
      <div className="h-8 w-1/3 rounded bg-surface-2" />
      <div className="h-5 w-1/4 rounded bg-surface-2" />
      <div className="h-14 w-full rounded bg-surface-2" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-surface-2" />
        <div className="h-4 w-5/6 rounded bg-surface-2" />
        <div className="h-4 w-2/3 rounded bg-surface-2" />
      </div>
    </div>
  );
}
