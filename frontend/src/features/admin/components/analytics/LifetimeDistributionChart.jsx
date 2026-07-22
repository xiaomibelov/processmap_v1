import ChartCard from "../common/ChartCard";
import DistributionChart from "./DistributionChart";

export default function LifetimeDistributionChart({ bins = [] }) {
  return (
    <ChartCard
      title="Время жизни сессий"
      subtitle="От создания до последнего обновления"
      eyebrow="Lifetime"
    >
      <DistributionChart bins={bins} testId="analytics-lifetime-chart" />
    </ChartCard>
  );
}
