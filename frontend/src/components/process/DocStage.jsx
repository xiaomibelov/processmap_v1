import { useEffect, useMemo, useState } from "react";
import { buildSessionDocMarkdown } from "../../features/process/lib/docMarkdown";
import { copyText, renderMarkdownPreview } from "../../features/process/lib/markdownPreview";

export default function DocStage({
  sessionId,
  draft,
}) {
  const [mode, setMode] = useState("preview");
  const [copyState, setCopyState] = useState("idle");

  const markdown = useMemo(
    () => buildSessionDocMarkdown({ sessionId, draft }),
    [sessionId, draft],
  );
  const previewBlocks = useMemo(() => renderMarkdownPreview(markdown), [markdown]);

  useEffect(() => {
    if (copyState === "idle") return undefined;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopyMarkdown() {
    const ok = await copyText(markdown);
    setCopyState(ok ? "copied" : "failed");
  }

  return (
    <section className="docStage">
      <div className="docToolbar">
        <div className="inline-flex items-center gap-2">
          <span className="badge">Документ процесса</span>
          <button
            type="button"
            className={`secondaryBtn h-9 px-3 text-xs ${mode === "preview" ? "border-accent/60 bg-accentSoft text-fg" : ""}`}
            onClick={() => setMode("preview")}
          >
            Просмотр
          </button>
          <button
            type="button"
            className={`secondaryBtn h-9 px-3 text-xs ${mode === "raw" ? "border-accent/60 bg-accentSoft text-fg" : ""}`}
            onClick={() => setMode("raw")}
          >
            Исходник
          </button>
        </div>
        <div className="inline-flex items-center gap-2">
          <button type="button" className="primaryBtn h-9 px-3 text-xs" onClick={handleCopyMarkdown}>
            Скопировать исходный Markdown
          </button>
          {copyState === "copied" ? <span className="badge ok">Исходный Markdown скопирован</span> : null}
          {copyState === "failed" ? <span className="badge err">Не удалось скопировать</span> : null}
        </div>
      </div>

      {mode === "preview" ? (
        <div className="docPreview">
          <article className="docProse">
            {previewBlocks}
          </article>
        </div>
      ) : (
        <div className="docRawWrap">
          <textarea className="docRawTextarea" value={markdown} readOnly />
        </div>
      )}
    </section>
  );
}
