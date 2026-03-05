function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

export default function GatewaysPanel({
  gateways = [],
  choices = {},
  activeGatewayId = "",
  onChangeChoice,
}) {
  const rows = asArray(gateways);
  const selectedMap = asObject(choices);
  return (
    <aside className="diagramIssueListWrap" data-testid="gateways-panel">
      <div className="muted mb-1 text-[11px]">Gateways</div>
      {!rows.length ? (
        <div className="diagramActionPopoverEmpty text-[11px]">Нет gateway в текущем graph.</div>
      ) : (
        <div className="diagramIssueList">
          {rows.map((gatewayRaw) => {
            const gateway = asObject(gatewayRaw);
            const gatewayId = toText(gateway?.gateway_id);
            const gatewayName = toText(gateway?.name || gatewayId);
            const isActive = gatewayId && gatewayId === toText(activeGatewayId);
            const options = asArray(gateway?.outgoing);
            const selectedValue = toText(selectedMap[gatewayId]);
            return (
              <div
                key={`gateway_panel_${gatewayId}`}
                className={`rounded-md border px-2 py-1.5 ${isActive ? "border-accent/70 bg-accentSoft" : "border-border bg-panel2/40"}`}
                data-testid={`gateway-item-${gatewayId}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold" title={gatewayName}>{gatewayName}</span>
                  {isActive ? (
                    <span className="diagramIssueChip" data-testid={`gateway-active-${gatewayId}`}>active</span>
                  ) : null}
                </div>
                <select
                  className="select h-7 min-h-0 w-full text-[11px]"
                  value={selectedValue}
                  onChange={(event) => onChangeChoice?.(gatewayId, event.target.value)}
                  data-testid={`gateway-select-${gatewayId}`}
                >
                  <option value="">Выберите исход…</option>
                  {options.map((optionRaw) => {
                    const option = asObject(optionRaw);
                    const flowId = toText(option?.flow_id);
                    const label = toText(option?.label || flowId || "Flow");
                    return (
                      <option key={`gateway_option_${gatewayId}_${flowId}`} value={flowId}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
