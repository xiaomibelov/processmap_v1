import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Загрузка аналитики">
      <div className={styles.header}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonTabs}`} />
      </div>
      <div className={styles.body}>
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}><div className={`${styles.skeleton} ${styles.skeletonKpiValue}`} /><div className={`${styles.skeleton} ${styles.skeletonKpiLabel}`} /></div>
          <div className={styles.kpiCard}><div className={`${styles.skeleton} ${styles.skeletonKpiValue}`} /><div className={`${styles.skeleton} ${styles.skeletonKpiLabel}`} /></div>
          <div className={styles.kpiCard}><div className={`${styles.skeleton} ${styles.skeletonKpiValue}`} /><div className={`${styles.skeleton} ${styles.skeletonKpiLabel}`} /></div>
          <div className={styles.kpiCard}><div className={`${styles.skeleton} ${styles.skeletonKpiValue}`} /><div className={`${styles.skeleton} ${styles.skeletonKpiLabel}`} /></div>
        </div>
        <div className={styles.overviewGrid}>
          <div className={styles.distributionCard}><div className={`${styles.skeleton} ${styles.skeletonSectionTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonBar}`} /><div className={`${styles.skeleton} ${styles.skeletonBar}`} /><div className={`${styles.skeleton} ${styles.skeletonBar}`} /></div>
          <div className={styles.sideColumn}>
            <div className={styles.sideCard}><div className={`${styles.skeleton} ${styles.skeletonSectionTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonLine}`} /><div className={`${styles.skeleton} ${styles.skeletonLine}`} /></div>
            <div className={styles.sideCard}><div className={`${styles.skeleton} ${styles.skeletonSectionTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonMeter}`} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
