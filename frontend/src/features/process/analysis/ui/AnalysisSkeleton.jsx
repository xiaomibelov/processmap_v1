import React from "react";
import styles from "./AnalysisSkeleton.module.css";

function SkeletonCard() {
  return (
    <div className={styles.card} aria-hidden="true" data-testid="analysis-skeleton-card">
      <div className={`${styles.shimmer} ${styles.cardHeader}`} />
      <div className={`${styles.shimmer} ${styles.cardLine}`} />
      <div className={`${styles.shimmer} ${styles.cardLineShort}`} />
    </div>
  );
}

function SkeletonTableRow({ columns = 4 }) {
  return (
    <div className={styles.tableRow} aria-hidden="true">
      {Array.from({ length: columns }).map((_, idx) => (
        <div key={idx} className={`${styles.shimmer} ${styles.tableCell}`} />
      ))}
    </div>
  );
}

export const AnalysisSkeleton = React.memo(function AnalysisSkeleton({
  variant = "card",
  count = 6,
  columns = 4,
  "data-testid": dataTestId,
}) {
  if (variant === "table") {
    return (
      <div
        className={styles.container}
        data-testid={dataTestId || "analysis-skeleton-table"}
        style={{ "--analysis-skeleton-columns": columns }}
      >
        <div className={styles.tableHeader} aria-hidden="true">
          {Array.from({ length: columns }).map((_, idx) => (
            <div key={idx} className={`${styles.shimmer} ${styles.tableHeaderCell}`} />
          ))}
        </div>
        <div className={styles.tableBody}>
          {Array.from({ length: count }).map((_, idx) => (
            <SkeletonTableRow key={idx} columns={columns} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.grid} data-testid={dataTestId || "analysis-skeleton-cards"}>
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonCard key={idx} />
      ))}
    </div>
  );
});
