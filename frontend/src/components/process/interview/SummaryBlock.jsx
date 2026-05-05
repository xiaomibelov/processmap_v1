import { formatPercent, toText } from "./utils";

function toMinutes(value) {
  const sec = Number(value);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec / 60);
}

export default function SummaryBlock({
  collapsed,
  toggleBlock,
  extendedAnalytics,
  topWaits,
  exceptionsCount,
  dodSnapshot,
}) {
  const snapshotCounts = dodSnapshot?.counts?.interview || {};
  const snapshotTime = dodSnapshot?.time || {};
  const totalSteps = Number(snapshotCounts?.stepsTotal || 0);
  const boundSteps = Number(snapshotCounts?.stepsBoundToBpmn || 0);
  const activeMin = toMinutes(snapshotTime?.processTotalSec);
  const mainlineMin = toMinutes(snapshotTime?.mainlineTotalSec);
  const waitMin = toMinutes(snapshotTime?.waitTotalSec);
  const leadMin = activeMin + waitMin;
  const aiTotal = Number(snapshotCounts?.aiQuestionsTotal || 0);
  const aiDone = Number(snapshotCounts?.aiQuestionsDoneTotal || 0);
  const aiOpen = Number(snapshotCounts?.aiQuestionsOpenTotal || Math.max(0, aiTotal - aiDone));
  const tiers = dodSnapshot?.counts?.tiers || {};

  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div className="interviewBlockTitle">C. Итоги и время</div>
        <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("summary")}>
          {collapsed ? "Показать" : "Скрыть"}
        </button>
      </div>
      {!collapsed ? (
        <>
          <div className="interviewSummaryRow">
            <div className="interviewSummaryCard">
              <div className="muted small">Сумма активного времени</div>
              <div className="interviewSummaryValue">{activeMin} мин</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Mainline время</div>
              <div className="interviewSummaryValue">{mainlineMin} мин</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Lead time (итого)</div>
              <div className="interviewSummaryValue">{leadMin} мин</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Средняя длительность шага</div>
              <div className="interviewSummaryValue">{totalSteps > 0 ? Math.round(leadMin / totalSteps) : 0} мин</div>
            </div>
          </div>

          <div className="interviewSummaryRow" style={{ marginTop: 10 }}>
            <div className="interviewSummaryCard">
              <div className="muted small">Привязка к BPMN</div>
              <div className="interviewSummaryValue">{boundSteps}/{totalSteps}</div>
              <div className="muted small">{formatPercent(totalSteps > 0 ? (boundSteps / totalSteps) * 100 : 0)}</div>
            </div>
            <div className="interviewSummaryCard">
              <div className="muted small">Пропускная способность</div>
              <div className="interviewSummaryValue">{extendedAnalytics.stepsPerHour}</div>
              <div className="muted small">шага/час</div>
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

          <details className="interviewAdvancedDetails">
            <summary>Дополнительно: распределения, AI и диагностика покрытия</summary>
            <div className="interviewSummaryRow" style={{ marginTop: 10 }}>
              <div className="interviewSummaryCard">
                <div className="muted small">Tiers (flows)</div>
                <div className="interviewSummaryValue">P0:{Number(tiers?.P0 || 0)} P1:{Number(tiers?.P1 || 0)} P2:{Number(tiers?.P2 || 0)}</div>
                <div className="muted small">None: {Number(tiers?.None || 0)}</div>
              </div>
              <div className="interviewSummaryCard">
                <div className="muted small">AI-покрытие шагов</div>
                <div className="interviewSummaryValue">{aiTotal}</div>
                <div className="muted small">open: {aiOpen} · done: {aiDone}</div>
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
                  <li>AI-вопросы: {aiTotal}</li>
                  <li>Подтверждено: {aiDone}</li>
                  <li>Уточнить: {aiOpen}</li>
                  <li>Неизвестно: {Math.max(0, aiTotal - aiDone - aiOpen)}</li>
                  <li>Исключений: {Number(snapshotCounts?.exceptionsTotal || exceptionsCount || 0)}</li>
                  <li>Суммарно добавляет: +{extendedAnalytics.exceptionAddMinTotal} мин</li>
                </ul>
              </div>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
