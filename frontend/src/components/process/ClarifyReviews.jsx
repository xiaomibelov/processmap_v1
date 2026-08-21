function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export function ApiClarifyReview({ list, meta, onOpenNode, onBackToDiagram }) {
  const rows = asArray(list);
  return (
    <div className="apiReviewPage">
      <div className="apiReviewHead">
        <div className="apiReviewTitle">Уточнения по API</div>
        <div className="apiReviewMeta">
          <span>источник: <b>API-валидаторы</b></span>
          <span>
            open <b>{Number(meta?.validatorOpenTotal || rows.length)}</b>
          </span>
          <span>
            critical <b>{Number(meta?.criticalTotal || 0)}</b>
          </span>
        </div>
        <div className="apiReviewActions">
          <button className="secondaryBtn smallBtn" onClick={onBackToDiagram}>
            К диаграмме
          </button>
        </div>
      </div>

      <div className="apiReviewInfo">
        <div className="small">
          Откуда вопросы: <b>{meta?.sourceLabel || "API-валидаторы"}</b>.
        </div>
        <div className="small">
          Важно: валидаторные API-вопросы и LLM-вопросы приходят из разных источников.
        </div>
        <div className="small">
          Что делать: 1) пройти список, 2) добавить ответы в заметки слева, 3) нажать «Отправить», 4) снова запустить AI.
        </div>
      </div>

      <div className="apiReviewList">
        {rows.length === 0 ? (
          <div className="apiReviewEmpty">Пока нет уточнений. Загрузите BPMN и запустите AI-анализ.</div>
        ) : (
          rows.map((x) => (
            <div key={x.nodeId} className="apiReviewItem">
              <div className="apiReviewItemHead">
                <div>
                  <b>{x.title}</b> · open {x.total}
                  {x.critical > 0 ? ` · critical ${x.critical}` : ""}
                </div>
                <button className="secondaryBtn smallBtn" onClick={() => onOpenNode?.(x.nodeId)}>
                  К узлу
                </button>
              </div>
              <div className="small muted">node_id: {x.nodeId}</div>
              {x.questions.map((q, idx) => (
                <div key={idx} className="small muted">
                  {q}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function LlmOnlyReview({ list, meta, onOpenNode, onBackToDiagram }) {
  const rows = asArray(list);
  return (
    <div className="apiReviewPage llmReviewPage">
      <div className="apiReviewHead">
        <div className="apiReviewTitle">LLM-вопросы (только DeepSeek)</div>
        <div className="apiReviewMeta">
          <span>
            источник: <b>LLM (/ai/questions)</b>
          </span>
          <span>
            open <b>{Number(meta?.llmOpenTotal || rows.length)}</b>
          </span>
        </div>
        <div className="apiReviewActions">
          <button className="secondaryBtn smallBtn" onClick={onBackToDiagram}>
            К диаграмме
          </button>
        </div>
      </div>

      <div className="apiReviewInfo">
        <div className="small">Здесь только вопросы, пришедшие от LLM. Валидаторные API-вопросы не показываются.</div>
      </div>

      <div className="apiReviewList">
        {rows.length === 0 ? (
          <div className="apiReviewEmpty">LLM-вопросов пока нет. После настройки AI-ключа нажмите кнопку «✦ AI» на диаграмме.</div>
        ) : (
          rows.map((x) => (
            <div key={x.nodeId} className="apiReviewItem">
              <div className="apiReviewItemHead">
                <div>
                  <b>{x.title}</b> · llm open {x.total}
                </div>
                <button className="secondaryBtn smallBtn" onClick={() => onOpenNode?.(x.nodeId)}>
                  К узлу
                </button>
              </div>
              <div className="small muted">node_id: {x.nodeId}</div>
              {x.questions.map((q, idx) => (
                <div key={idx} className="small muted">
                  {q}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
