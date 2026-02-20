import { formatPercent, toText } from "./utils";

export default function SummaryBlock({
  collapsed,
  toggleBlock,
  summary,
  extendedAnalytics,
  timelineViewLength,
  topWaits,
  exceptionsCount,
}) {
  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div className="interviewBlockTitle">C. Подсветка времени и итоги</div>
        <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("summary")}>
          {collapsed ? "Показать" : "Скрыть"}
        </button>
      </div>
      {!collapsed ? (
        <>
          <div className="interviewSummaryRow">
            <div className="interviewSummaryCard">
              <div className="muted small">Сумма активного времени</div>
              <div className="interviewSummaryValue">{summary.active} мин</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Сумма ожиданий</div>
              <div className="interviewSummaryValue">{summary.wait} мин</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Lead time (итого)</div>
              <div className="interviewSummaryValue">{summary.lead} мин</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Средняя длительность шага</div>
              <div className="interviewSummaryValue">{extendedAnalytics.avgLeadPerStepMin} мин</div>
            </div>
          </div>

          <div className="interviewSummaryRow" style={{ marginTop: 10 }}>
            <div className="interviewSummaryCard">
              <div className="muted small">Привязка к BPMN</div>
              <div className="interviewSummaryValue">{extendedAnalytics.boundStepCount}/{timelineViewLength}</div>
              <div className="muted small">{formatPercent(extendedAnalytics.bindCoveragePct)}</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Заполненность границ</div>
              <div className="interviewSummaryValue">{extendedAnalytics.boundariesFilled}/{extendedAnalytics.boundariesTotal}</div>
              <div className="muted small">{formatPercent(extendedAnalytics.boundariesCoveragePct)}</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">AI-покрытие шагов</div>
              <div className="interviewSummaryValue">{extendedAnalytics.aiStepCoverageCount}/{timelineViewLength}</div>
              <div className="muted small">{formatPercent(extendedAnalytics.aiStepCoveragePct)}</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Пропускная способность</div>
              <div className="interviewSummaryValue">{extendedAnalytics.stepsPerHour}</div>
              <div className="muted small">шага/час</div>
            </div>
          </div>

          <div className="interviewAnalyticsGrid">
            <div className="interviewSummaryCard">
              <div className="muted small">Распределение по типам шагов</div>
              {!extendedAnalytics.typeStats.length ? (
                <div className="muted">Нет шагов.</div>
              ) : (
                <ul className="interviewList">
                  {extendedAnalytics.typeStats.map((x) => (
                    <li key={x.key}>
                      {x.label}: {x.count} ({formatPercent(x.sharePct)}) · lead {x.lead} мин
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Распределение по лайнам</div>
              {!extendedAnalytics.laneStats.length ? (
                <div className="muted">Нет лайнов.</div>
              ) : (
                <ul className="interviewList">
                  {extendedAnalytics.laneStats.map((x) => (
                    <li key={x.key}>
                      {x.name}: {x.count} ({formatPercent(x.sharePct)}) · lead {x.lead} мин
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Распределение по подпроцессам</div>
              {!extendedAnalytics.subprocessStats.length ? (
                <div className="muted">Подпроцессы не выделены.</div>
              ) : (
                <ul className="interviewList">
                  {extendedAnalytics.subprocessStats.map((x) => (
                    <li key={x.key}>
                      {x.name}: {x.count} ({formatPercent(x.sharePct)}) · lead {x.lead} мин
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">AI и исключения</div>
              <ul className="interviewList">
                <li>AI-вопросы: {extendedAnalytics.aiTotal}</li>
                <li>Подтверждено: {extendedAnalytics.aiConfirmed}</li>
                <li>Уточнить: {extendedAnalytics.aiClarify}</li>
                <li>Неизвестно: {extendedAnalytics.aiUnknown}</li>
                <li>Исключений: {exceptionsCount}</li>
                <li>Суммарно добавляет: +{extendedAnalytics.exceptionAddMinTotal} мин</li>
              </ul>
            </div>
          </div>

          <div className="interviewTopWaits">
            <div className="small muted">Топ-3 ожидания</div>
            {!topWaits.length ? (
              <div className="muted">Пока нет шагов с ожиданием.</div>
            ) : (
              <ul className="interviewList">
                {topWaits.map((x) => (
                  <li key={x.id}>Шаг {x.seq}: {toText(x.action) || "—"} — {x.wait} мин</li>
                ))}
              </ul>
            )}
            <div className="muted small" style={{ marginTop: 6 }}>
              {extendedAnalytics.maxDurationStep
                ? `Самый долгий активный шаг: #${extendedAnalytics.maxDurationStep.seq} (${extendedAnalytics.maxDurationStep.duration} мин).`
                : "Самый долгий активный шаг пока не определён."}
              {" "}
              {extendedAnalytics.maxWaitStep
                ? `Самое длинное ожидание: #${extendedAnalytics.maxWaitStep.seq} (${extendedAnalytics.maxWaitStep.wait} мин).`
                : "Самое длинное ожидание пока не определено."}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
