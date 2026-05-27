export default function LoadingSkeleton() {
  return (
    <div className="registrySkeleton" data-testid="registry-loading-skeleton">
      <div className="registrySkeletonHead">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="registrySkeletonBar registrySkeletonBar--head" />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="registrySkeletonRow">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="registrySkeletonBar" />
          ))}
        </div>
      ))}
    </div>
  );
}
