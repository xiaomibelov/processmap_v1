import { useTldr } from "../hooks/useTldr";
import TldrCard from "./TldrCard";

function text(value) {
  return String(value || "").trim();
}

export default function DerivedContextSurface({
  draft,
  sessionTitle = "",
}) {
  const sid = text(draft?.session_id);
  const tldr = useTldr(draft);
  const hasActiveSession = !!sid;

  if (!hasActiveSession) return null;

  return (
    <div
      className="fixed bottom-24 right-5 z-[85] w-[min(92vw,360px)] rounded-3xl border border-border bg-panel/95 p-4 shadow-panel backdrop-blur"
      data-testid="derived-context-surface"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Derived context</div>
          <div className="mt-1 text-sm font-black text-fg">Контекст процесса</div>
          {text(sessionTitle) ? (
            <div className="mt-1 truncate text-[11px] text-muted">{text(sessionTitle)}</div>
          ) : null}
        </div>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
          Live
        </span>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-bg/40 px-3 py-2">
        <div className="text-[11px] leading-relaxed text-muted">
          Сводка выводится отдельно от заметок и обсуждений. Это производный контекст по сессии, а не discussion surface.
        </div>
        <TldrCard tldr={tldr} />
      </div>
    </div>
  );
}
