export default function AnalyticsSkeleton() {
  return (
    <div className="analyticsState analyticsSkeleton" role="status" aria-live="polite" data-testid="analytics-skeleton">
      <div className="analyticsSkeletonGrid" aria-hidden="true">
        <div className="analyticsSkeletonCard" />
        <div className="analyticsSkeletonCard" />
        <div className="analyticsSkeletonCard" />
        <div className="analyticsSkeletonCard" />
      </div>
      <div className="analyticsSkeletonSection" aria-hidden="true" />
      <div className="analyticsSkeletonSection" aria-hidden="true" />
      <span className="visuallyHidden">Загрузка аналитики…</span>
    </div>
  );
}
