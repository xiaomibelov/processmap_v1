import { useMemo, useState } from "react";
import { renderMarkdownPreview } from "../../../features/process/lib/markdownPreview";

export default function MarkdownBlock({
  collapsed,
  toggleBlock,
  copyToNotes,
  copyState,
  markdownReport,
}) {
  const [mode, setMode] = useState("preview");
  const previewBlocks = useMemo(() => renderMarkdownPreview(markdownReport), [markdownReport]);

  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div>
          <div className="interviewBlockTitle">Документ процесса</div>
        </div>
        <div className="interviewBlockTools">
          <button type="button" className={`secondaryBtn smallBtn ${mode === "preview" ? "border-accent/60 bg-accentSoft text-fg" : ""}`} onClick={() => setMode("preview")}>
            Просмотр
          </button>
          <button type="button" className={`secondaryBtn smallBtn ${mode === "raw" ? "border-accent/60 bg-accentSoft text-fg" : ""}`} onClick={() => setMode("raw")}>
            Исходник
          </button>
          <button type="button" className="primaryBtn smallBtn" style={{ width: "auto" }} onClick={copyToNotes}>Скопировать исходный Markdown</button>
          <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("markdown")}>
            {collapsed ? "Показать" : "Скрыть"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="interviewMarkdownWrap">
          <div className="interviewMarkdownToolbar">
            <span className="badge">Формат: Markdown</span>
            <div className="inline-flex items-center gap-2">
              {copyState === "copied" ? <span className="badge ok">Исходный Markdown скопирован</span> : null}
              {copyState === "failed" ? <span className="badge err">Не удалось скопировать автоматически</span> : null}
            </div>
          </div>
          {mode === "preview" ? (
            <div className="interviewMarkdownPreview">
              <article className="docProse">
                {previewBlocks}
              </article>
            </div>
          ) : (
            <div className="interviewMarkdownRaw">
              <textarea className="interviewMarkdownRawTextarea" value={markdownReport} readOnly />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
