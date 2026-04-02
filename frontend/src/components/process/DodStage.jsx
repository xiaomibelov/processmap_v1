import { Fragment, useState } from "react";
import DodExplainTooltip from "./dod/DodExplainTooltip";
import { DOD_EXPLAINABILITY } from "./dod/dodExplainability";

const fallbackDodReadiness = {
  overall: { score: 0, status: "incomplete", statusLabel: "Нет данных", isBlocked: false },
  summary: {
    title: "Готовность PM",
    project: "—",
    session: "—",
    readiness: 0,
    profiles: { document: 0, automation: 0, audit: 0 },
    status: "Нет данных",
    overallStatus: "incomplete",
    blockers: 0,
    gaps: 0,
    infos: 0,
    realSections: 0,
    mockSections: 0,
    explainability: {},
  },
  sections: [],
  hardBlockers: [],
  softGaps: [],
  blockers: [],
  gaps: [],
  to100: [],
  counts: { hardBlockers: 0, softGaps: 0, infos: 0, sections: 0, signals: 0 },
  profiles: { document: 0, automation: 0, audit: 0 },
  columnsExplainability: {},
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toStatusTone(statusRaw) {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (status === "ok") return "ok";
  if (status === "warning" || status === "partial") return "warn";
  if (status === "weak") return "err";
  return "muted";
}

function toTypeTone(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (type === "жёсткий") return "err";
  if (type === "смешанный") return "warn";
  return "muted";
}

function toTypeExplain(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (type === "жёсткий") return DOD_EXPLAINABILITY.types.hard;
  if (type === "смешанный") return DOD_EXPLAINABILITY.types.mixed;
  return DOD_EXPLAINABILITY.types.soft;
}

function toStatusExplain(statusRaw) {
  const key = String(statusRaw || "").trim().toLowerCase();
  if (key === "ok") return DOD_EXPLAINABILITY.statuses.ok;
  if (key === "warning") return DOD_EXPLAINABILITY.statuses.warning;
  if (key === "partial") return DOD_EXPLAINABILITY.statuses.partial;
  if (key === "weak") return DOD_EXPLAINABILITY.statuses.weak;
  return null;
}

function toImpactExplain(impactTypeRaw) {
  const key = String(impactTypeRaw || "").trim().toLowerCase();
  if (key === "hard") return DOD_EXPLAINABILITY.impacts.hardGate;
  return DOD_EXPLAINABILITY.impacts.softScore;
}

function toImpactLabel(impactTypeRaw) {
  const key = String(impactTypeRaw || "").trim().toLowerCase();
  return key === "hard" ? "hard gate" : "soft score";
}

function explainabilityOr(primary, fallback) {
  const safe = asObject(primary);
  if (Object.keys(safe).length > 0) return safe;
  return fallback || null;
}

function toKindLabel(kindRaw) {
  const kind = String(kindRaw || "").trim();
  if (kind === "canonical_supporting") return "canonical";
  if (kind === "secondary") return "secondary";
  if (kind === "non_canonical") return "info";
  return "";
}

function toKindTone(kindRaw) {
  const kind = String(kindRaw || "").trim();
  if (kind === "canonical_supporting") return "ok";
  if (kind === "secondary") return "warn";
  return "muted";
}

/* ── Shared micro-components ── */

function HintLabel({ text, explainability, className = "" }) {
  return (
    <span className={`dodCellWithHint ${className}`.trim()}>
      <span>{text}</span>
      <DodExplainTooltip explainability={explainability} label={text} />
    </span>
  );
}

function onMockAction(action, payload) {
  // eslint-disable-next-line no-console
  console.log("[DoD action]", action, payload || {});
}

function EmptyIssuesRow({ colSpan = 3 }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <span className="text-xs text-muted">Для подключённых real-разделов активных записей нет.</span>
      </td>
    </tr>
  );
}

function DodDivider() {
  return <div className="dodBlockDivider" />;
}

/* ── Signals expand panel (inline inside section row) ── */

function SectionSignalsPanel({ signals }) {
  const rows = asArray(signals);
  if (!rows.length) return null;
  return (
    <div className="dodSignalsPanel">
      <table className="docTable dodSignalsTable">
        <thead>
          <tr>
            <th>Код</th>
            <th>Описание</th>
            <th>Класс</th>
            <th>Score</th>
            <th>Pass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((signal) => {
            const kindLabel = toKindLabel(signal.kind);
            return (
              <tr key={signal.code}>
                <td>
                  <HintLabel
                    text={signal.code}
                    explainability={signal.explainability}
                    className="dodCellWithHint--tight"
                  />
                </td>
                <td>
                  <HintLabel
                    text={signal.issue || "—"}
                    explainability={signal.explainability}
                    className="dodCellWithHint--tight"
                  />
                </td>
                <td>
                  {kindLabel ? (
                    <span className={`badge ${toKindTone(signal.kind)}`}>{kindLabel}</span>
                  ) : (
                    <span className="badge muted">—</span>
                  )}
                </td>
                <td className="tabular-nums">{Number.isFinite(Number(signal.score)) ? Number(signal.score) : "—"}</td>
                <td>
                  <span className={`badge ${signal.pass ? "ok" : "err"}`}>
                    {signal.pass ? "pass" : "fail"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Section row with integrated expand toggle ── */

function SectionRow({ row, columnsExplainability }) {
  const [expanded, setExpanded] = useState(false);
  const sectionExplain = explainabilityOr(row?.explainability, DOD_EXPLAINABILITY.sections[row.id]);
  const sourceKind = toText(row?.sourceKind || "mock");
  const signalCount = asArray(row?.signals).length;

  return (
    <Fragment>
      <tr className={expanded ? "dodSectionRow dodSectionRow--expanded" : "dodSectionRow"}>
        <td>
          <div className="dodSectionCell">
            <HintLabel text={row.section} explainability={sectionExplain} className="dodCellWithHint--tight" />
            <span className={`badge badge--micro ${sourceKind === "real" ? "ok" : "muted"}`}>
              {sourceKind === "real" ? "real" : "mock"}
            </span>
            {signalCount > 0 ? (
              <button
                type="button"
                className="dodExpandBtn"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Скрыть" : "Показать"} сигналы ${row.section}`}
                onClick={() => setExpanded((prev) => !prev)}
              >
                <span className="dodExpandChevron" data-open={expanded ? "" : undefined}>▸</span>
                <span className="dodExpandLabel">{signalCount}</span>
              </button>
            ) : null}
          </div>
        </td>
        <td className="tabular-nums">{Number(row.weight || 0)}</td>
        <td className="tabular-nums">{Number(row.percent || 0)}%</td>
        <td className="tabular-nums">{Number(row.contribution || 0).toFixed(1)}</td>
        <td>
          <span className="dodBadgeWithHint">
            <span className={`badge ${toTypeTone(row.type)}`}>{row.type}</span>
            <DodExplainTooltip explainability={explainabilityOr(row?.typeExplainability, toTypeExplain(row.type))} label={`${row.section}: тип`} />
          </span>
        </td>
        <td>
          <span className="dodBadgeWithHint">
            <span className={`badge ${toStatusTone(row.status)}`}>{row.status}</span>
            <DodExplainTooltip explainability={explainabilityOr(row?.statusExplainability, toStatusExplain(row.status))} label={`${row.section}: статус`} />
          </span>
        </td>
        <td>
          <button
            type="button"
            className="secondaryBtn tinyBtn dodActionBtn"
            onClick={() => onMockAction("section_action", { sectionId: row.id, action: row.action })}
          >
            {row.action || "Открыть"}
          </button>
        </td>
      </tr>
      {expanded && signalCount > 0 ? (
        <tr className="dodSignalsRow">
          <td colSpan={7} className="dodSignalsTd">
            <SectionSignalsPanel signals={row.signals} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/* ── Issues details sub-table ── */

function IssuesDetailsTable({ title, rows, groupExplainability, columnsExplainability }) {
  return (
    <details className="dodDetailsDisclosure">
      <summary className="dodDetailsSummary">{title}</summary>
      <div className="docTableWrap dodDetailsTableWrap">
        <table className="docTable">
          <thead>
            <tr>
              <th>
                <HintLabel
                  text="Код"
                  explainability={explainabilityOr(columnsExplainability?.section, DOD_EXPLAINABILITY.columns.section)}
                />
              </th>
              <th>
                <HintLabel text="Параметр" explainability={groupExplainability} />
              </th>
              <th>
                <HintLabel
                  text="Источник"
                  explainability={explainabilityOr(columnsExplainability?.status, DOD_EXPLAINABILITY.columns.status)}
                />
              </th>
              <th>
                <HintLabel text="Влияние" explainability={groupExplainability} />
              </th>
            </tr>
          </thead>
          <tbody>
            {asArray(rows).map((row) => {
              const issueExplain = explainabilityOr(row?.explainability, DOD_EXPLAINABILITY.issues[row?.id]);
              const sourceExplain = explainabilityOr(row?.sourceExplainability, DOD_EXPLAINABILITY.sources[row?.sourceKey]);
              return (
                <tr key={`detail_${row.id}`}>
                  <td>
                    <HintLabel text={row.id} explainability={issueExplain} className="dodCellWithHint--tight" />
                  </td>
                  <td>
                    <HintLabel text={row.issue} explainability={issueExplain} className="dodCellWithHint--tight" />
                  </td>
                  <td>
                    <HintLabel
                      text={String(row.sourceKey || "derived")}
                      explainability={sourceExplain}
                      className="dodCellWithHint--tight"
                    />
                  </td>
                  <td>
                    <span className="dodBadgeWithHint">
                      <span className={`badge ${toTypeTone(row.impactType === "hard" ? "жёсткий" : "мягкий")}`}>
                        {toImpactLabel(row.impactType)}
                      </span>
                      <DodExplainTooltip
                        explainability={explainabilityOr(row?.explainability, toImpactExplain(row.impactType))}
                        label={toImpactLabel(row.impactType)}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ── Main DodStage component ── */

export default function DodStage({ readiness = null }) {
  const data = asObject(readiness);
  const hasReadyData = toText(data?.version) === "dod_readiness_v1";
  const view = hasReadyData ? data : fallbackDodReadiness;
  const summary = asObject(view.summary);
  const columnsExplainability = asObject(view.columnsExplainability);

  const summaryReadinessExplain = explainabilityOr(summary?.explainability?.readiness, DOD_EXPLAINABILITY.summary.readiness);
  const summaryDocumentExplain = explainabilityOr(summary?.explainability?.document, DOD_EXPLAINABILITY.summary.document);
  const summaryAutomationExplain = explainabilityOr(summary?.explainability?.automation, DOD_EXPLAINABILITY.summary.automation);
  const summaryAuditExplain = explainabilityOr(summary?.explainability?.audit, DOD_EXPLAINABILITY.summary.audit);
  const summaryBlockersExplain = explainabilityOr(summary?.explainability?.blockers, DOD_EXPLAINABILITY.summary.blockers);
  const summaryGapsExplain = explainabilityOr(summary?.explainability?.gaps, DOD_EXPLAINABILITY.summary.gaps);

  const blockersRows = asArray(view.blockers);
  const gapsRows = asArray(view.gaps);
  const to100Rows = asArray(view.to100);

  return (
    <section className="docStage dodStage" data-testid="dod-stage">
      <div className="docPreview dodPreview">

        {/* ── Summary card ── */}
        <section className="docSection dodBlock" data-testid="dod-summary-card">
          <div className="docSectionHead">
            <div>
              <h3 className="docSectionTitle">{summary.title || "Готовность PM"}</h3>
              <div className="docCardHint">Проект: {summary.project || "—"} · Сессия: {summary.session || "—"}</div>
            </div>
            <div className="docInlineControls">
              <button type="button" className="secondaryBtn smallBtn" onClick={() => onMockAction("recompute")}>
                Пересчитать
              </button>
              <button type="button" className="primaryBtn smallBtn" onClick={() => onMockAction("open_issues")}>
                Открыть проблемы
              </button>
            </div>
          </div>

          <div className="docCardsGrid cols-4">
            <div className="docCard metric">
              <div className="docCardLabel"><HintLabel text="Общая готовность" explainability={summaryReadinessExplain} /></div>
              <div className="docCardValue">{Number(summary.readiness || 0)}%</div>
            </div>
            <div className="docCard metric">
              <div className="docCardLabel"><HintLabel text="Документ" explainability={summaryDocumentExplain} /></div>
              <div className="docCardValue">{Number(asObject(summary.profiles).document || 0)}%</div>
            </div>
            <div className="docCard metric">
              <div className="docCardLabel"><HintLabel text="Автоматизация" explainability={summaryAutomationExplain} /></div>
              <div className="docCardValue">{Number(asObject(summary.profiles).automation || 0)}%</div>
            </div>
            <div className="docCard metric">
              <div className="docCardLabel"><HintLabel text="Аудит" explainability={summaryAuditExplain} /></div>
              <div className="docCardValue">{Number(asObject(summary.profiles).audit || 0)}%</div>
            </div>
          </div>

          <div className="docScenarioSummary">
            <span className={`badge ${summary.overallStatus === "blocked" ? "err" : toStatusTone(summary.status)}`}>
              {summary.overallStatus === "blocked" ? `${summary.status} (blocked)` : (summary.status || "—")}
            </span>
            <span className="dodBadgeWithHint">
              <span className="badge err">Блокеры: {Number(summary.blockers || 0)}</span>
              <DodExplainTooltip explainability={summaryBlockersExplain} label="Блокеры" />
            </span>
            <span className="dodBadgeWithHint">
              <span className="badge warn">Пробелы: {Number(summary.gaps || 0)}</span>
              <DodExplainTooltip explainability={summaryGapsExplain} label="Пробелы" />
            </span>
            {Number(summary.infos || 0) > 0 ? (
              <span className="badge muted">Info: {Number(summary.infos)}</span>
            ) : null}
            <span className="badge muted">
              real: {Number(summary.realSections || 0)} · mock: {Number(summary.mockSections || 0)}
            </span>
            {!hasReadyData ? <span className="badge warn">fallback</span> : null}
          </div>
        </section>

        <DodDivider />

        {/* ── Sections table ── */}
        <section className="docSection dodBlock" data-testid="dod-sections-table">
          <h3 className="docSectionTitle">Готовность по разделам</h3>
          <div className="docTableWrap dodSectionsTableWrap">
            <table className="docTable dodSectionsTable">
              <thead>
                <tr>
                  <th><HintLabel text="Раздел" explainability={explainabilityOr(columnsExplainability.section, DOD_EXPLAINABILITY.columns.section)} /></th>
                  <th className="dodColNum"><HintLabel text="Вес" explainability={explainabilityOr(columnsExplainability.weight, DOD_EXPLAINABILITY.columns.weight)} /></th>
                  <th className="dodColNum"><HintLabel text="%" explainability={explainabilityOr(columnsExplainability.sectionPercent, DOD_EXPLAINABILITY.columns.sectionPercent)} /></th>
                  <th className="dodColNum"><HintLabel text="Вклад" explainability={explainabilityOr(columnsExplainability.contribution, DOD_EXPLAINABILITY.columns.contribution)} /></th>
                  <th><HintLabel text="Тип" explainability={explainabilityOr(columnsExplainability.type, DOD_EXPLAINABILITY.columns.type)} /></th>
                  <th><HintLabel text="Статус" explainability={explainabilityOr(columnsExplainability.status, DOD_EXPLAINABILITY.columns.status)} /></th>
                  <th className="dodColAction">Действие</th>
                </tr>
              </thead>
              <tbody>
                {asArray(view.sections).map((row) => (
                  <SectionRow key={row.id} row={row} columnsExplainability={columnsExplainability} />
                ))}
              </tbody>
              <tfoot>
                <tr className="dodTotalRow">
                  <td colSpan={2}>
                    <span className="dodBadgeWithHint">
                      <strong>Итого</strong>
                      <DodExplainTooltip explainability={summaryReadinessExplain} label="Итоговая готовность" />
                    </span>
                  </td>
                  <td className="tabular-nums"><strong>{Number(summary.readiness || 0)}%</strong></td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <DodDivider />

        {/* ── Hard blockers ── */}
        <section className="docSection dodBlock" data-testid="dod-hard-blockers">
          <div className="docSectionHead">
            <h3 className="docSectionTitle">
              <HintLabel text="Жёсткие блокеры" explainability={DOD_EXPLAINABILITY.groups.blockers} />
            </h3>
          </div>
          <div className="docTableWrap">
            <table className="docTable">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Проблема</th>
                  <th>Где</th>
                </tr>
              </thead>
              <tbody>
                {blockersRows.length === 0 ? <EmptyIssuesRow /> : blockersRows.map((item) => {
                  const issueExplain = explainabilityOr(item?.explainability, DOD_EXPLAINABILITY.issues[item.id]);
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="dodBadgeWithHint">
                          <span className="badge err">{item.id}</span>
                          <DodExplainTooltip explainability={issueExplain} label={item.id} />
                        </span>
                      </td>
                      <td><HintLabel text={item.issue} explainability={issueExplain} className="dodCellWithHint--tight" /></td>
                      <td>{item.where}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {blockersRows.length > 0 ? (
            <IssuesDetailsTable
              title="Показать детали параметров блокеров"
              rows={blockersRows}
              groupExplainability={DOD_EXPLAINABILITY.groups.blockers}
              columnsExplainability={columnsExplainability}
            />
          ) : null}
        </section>

        <DodDivider />

        {/* ── Soft gaps ── */}
        <section className="docSection dodBlock" data-testid="dod-gaps">
          <div className="docSectionHead">
            <h3 className="docSectionTitle">
              <HintLabel text="Неблокирующие пробелы" explainability={DOD_EXPLAINABILITY.groups.gaps} />
            </h3>
          </div>
          <div className="docTableWrap">
            <table className="docTable">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Проблема</th>
                  <th>Где</th>
                </tr>
              </thead>
              <tbody>
                {gapsRows.length === 0 ? <EmptyIssuesRow /> : gapsRows.map((item) => {
                  const issueExplain = explainabilityOr(item?.explainability, DOD_EXPLAINABILITY.issues[item.id]);
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="dodBadgeWithHint">
                          <span className="badge warn">{item.id}</span>
                          <DodExplainTooltip explainability={issueExplain} label={item.id} />
                        </span>
                      </td>
                      <td><HintLabel text={item.issue} explainability={issueExplain} className="dodCellWithHint--tight" /></td>
                      <td>{item.where}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {gapsRows.length > 0 ? (
            <IssuesDetailsTable
              title="Показать детали параметров пробелов"
              rows={gapsRows}
              groupExplainability={DOD_EXPLAINABILITY.groups.gaps}
              columnsExplainability={columnsExplainability}
            />
          ) : null}
        </section>

        <DodDivider />

        {/* ── To 100% ── */}
        <section className="docSection dodBlock" data-testid="dod-to-100">
          <h3 className="docSectionTitle">Что осталось до 100%</h3>
          <div className="docTableWrap">
            <table className="docTable">
              <thead>
                <tr>
                  <th>Приоритет</th>
                  <th>Действие</th>
                  <th>Раздел</th>
                  <th>+ к итогу</th>
                  <th>Тип</th>
                </tr>
              </thead>
              <tbody>
                {to100Rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <span className="text-xs text-muted">Список ремедиации появится после расчёта активных сигналов.</span>
                    </td>
                  </tr>
                ) : to100Rows.map((item) => (
                  <tr key={item.id}>
                    <td className="tabular-nums">{Number(item.priority || 0)}</td>
                    <td>
                      <HintLabel
                        text={item.task}
                        explainability={explainabilityOr(item?.explainability, DOD_EXPLAINABILITY.to100[item.id])}
                        className="dodCellWithHint--tight"
                      />
                    </td>
                    <td>
                      <HintLabel
                        text={item.section}
                        explainability={explainabilityOr(item?.sectionExplainability, DOD_EXPLAINABILITY.sections[item.sectionId])}
                        className="dodCellWithHint--tight"
                      />
                    </td>
                    <td>
                      <span className="dodBadgeWithHint">
                        <span className="badge ok">{item.delta}</span>
                        <DodExplainTooltip explainability={explainabilityOr(item?.explainability, DOD_EXPLAINABILITY.to100[item.id])} label={item.delta} />
                      </span>
                    </td>
                    <td>
                      <span className="dodBadgeWithHint">
                        <span className={`badge ${toTypeTone(item.type)}`}>{item.type}</span>
                        <DodExplainTooltip explainability={toTypeExplain(item.type)} label={item.type} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
