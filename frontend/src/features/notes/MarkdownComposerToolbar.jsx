import { MARKDOWN_COMPOSER_ACTIONS } from "./markdownComposerActions.js";

export default function MarkdownComposerToolbar({ onAction, disabled = false, testId = "notes-markdown-toolbar" }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5" data-testid={testId} aria-label="Инструменты Markdown">
      {MARKDOWN_COMPOSER_ACTIONS.map((item) => (
        <button
          key={item.action}
          type="button"
          className="secondaryBtn tinyBtn h-7 px-2 text-[11px]"
          title={item.title}
          aria-label={item.ariaLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction?.(item.action)}
          disabled={disabled}
          data-testid={`${testId}-${item.action}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
