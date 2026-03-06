import SectionCard from "./SectionCard";
import { toText } from "../../adminUtils";

export default function ErrorState({
  title = "Data load failed",
  message = "",
}) {
  return (
    <SectionCard title={title}>
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        {toText(message) || "Unknown admin data error"}
      </div>
    </SectionCard>
  );
}

