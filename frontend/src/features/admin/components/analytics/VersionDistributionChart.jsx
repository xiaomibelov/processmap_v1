import ChartCard from "../common/ChartCard";
import DistributionChart from "./DistributionChart";

export default function VersionDistributionChart({ bins = [] }) {
  return (
    <ChartCard
      title="Глубина истории версий"
      subtitle="Сколько версий накапливают сессии (только с историей)"
      eyebrow="Versions"
    >
      <DistributionChart bins={bins} testId="analytics-versions-chart" />
    </ChartCard>
  );
}
