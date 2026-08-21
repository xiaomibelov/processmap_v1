export default function BuildBadge() {
  const id = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
  const time = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
  const env = typeof __BUILD_ENV__ !== "undefined" ? __BUILD_ENV__ : "";
  if (!id || id === "dev") return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded border border-border bg-panel px-1.5 py-0.5 text-[10px] text-muted opacity-80">
      <code>{id}</code>
      {time ? <span>{time.slice(0, 19).replace("T", " ")}</span> : null}
      {env ? <span className="uppercase">{env}</span> : null}
    </span>
  );
}
