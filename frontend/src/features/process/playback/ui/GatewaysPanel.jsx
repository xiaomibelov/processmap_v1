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
  choiceSource = "manual_local_choices",
  readOnly = false,
  activeGatewayId = "",
  onChangeChoice,
  showTitle = true,
}) {
  const rows = asArray(gateways);
  const selectedMap = asObject(choices);
  return (
    <aside className="playbackGatewaysPanel" data-testid="gateways-panel">
      {showTitle ? <div className="playbackPanelTitle">Решения gateway</div> : null}
      <div className="playbackGatewayRowMeta" data-testid="gateways-panel-source">
        <span>source</span>
        <span className="diagramIssueChip">
          {toText(choiceSource) || "manual_local_choices"}
        </span>
      </div>
      {!rows.length ? (
        <div className="diagramActionPopoverEmpty text-[11px]">В текущем графе нет gateway.</div>
      ) : (
        <div className="playbackGatewayList">
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
                className={`playbackGatewayRow ${isActive ? "isActive" : ""}`}
                data-testid={`gateway-item-${gatewayId}`}
              >
                <div className="playbackGatewayRowHead">
                  <span className="truncate text-[11px] font-semibold" title={gatewayName}>
                    {gatewayName}
                  </span>
                  {isActive ? (
                    <span className="diagramIssueChip" data-testid={`gateway-active-${gatewayId}`}>текущий</span>
                  ) : null}
                </div>
                <div className="playbackGatewayRowMeta">
                  <span>{gatewayId}</span>
                  <span>{options.length} исход.</span>
                </div>
                <select
                  className="select h-8 min-h-0 w-full text-[11px]"
                  value={selectedValue}
                  disabled={readOnly === true}
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
